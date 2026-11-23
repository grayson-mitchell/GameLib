//! Engine state for non-Steam games (Phase 61, ported from `gameEngineState.ts` and the naming half
//! of `perGameBottle.ts`): the per-game bottle name for the install dialogs, the option list with
//! a read-only Legacy entry, and the global default engine.
//!
//! Everything is derived here so the renderer never computes eligibility, Legacy or bottle names.
//! Steam answers through its own adapter, so every function answers `None` for a bottle-runtime
//! store.

use serde::Serialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use crate::config::{
    engine_id_of, global_settings, read_engine_for_game, resolve_global_engine, EffectiveEngine,
    EngineSource,
};
use crate::ctx::EngineCtx;
use crate::engines::{
    is_installed_macos_release, is_pinned_engine_installed, wine_manager_releases,
};
use crate::ids::parse_engine_override_str;
use crate::jsutil::{js_to_string, js_trim, prop};
use crate::key::{engine_key_for, uses_bottle_runtime};
use crate::pins::pins;

/// The longest per-game bottle name (spike 068 accepted 120; 64 leaves every real store id whole).
pub const PER_GAME_BOTTLE_NAME_MAX: usize = 64;
const PREFIX: &str = "GameLib";
const HASH_HEX: usize = 10;

/// `sanitizeBottleName`, the T-17-01 chokepoint: the trimmed name, or `None` for an empty one or
/// one with a path separator, a parent-directory sequence or a NUL byte.
pub fn sanitize_bottle_name(name: &str) -> Option<String> {
    let trimmed = js_trim(name);
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.contains(['/', '\\', '\0']) || trimmed.contains("..") {
        return None;
    }
    Some(trimmed.to_string())
}

/// Keeps `[A-Za-z0-9-]` and writes every other UTF-8 byte as `_xx` (lower-case hex), which is
/// injective. A lone `.` is kept (Amazon ids carry them); a dot inside a run of dots is escaped so
/// `..` can never appear.
fn encode_app_name(app_name: &str) -> String {
    let bytes = app_name.as_bytes();
    let mut out = String::with_capacity(bytes.len());
    for (i, &b) in bytes.iter().enumerate() {
        let dot_in_run = b == b'.'
            && (i.checked_sub(1).map(|p| bytes[p]) == Some(b'.')
                || bytes.get(i + 1) == Some(&b'.'));
        if b.is_ascii_alphanumeric() || b == b'-' || (b == b'.' && !dot_in_run) {
            out.push(b as char);
        } else {
            out.push_str(&format!("_{b:02x}"));
        }
    }
    out
}

/// `perGameBottleName`: `GameLib-<runner>-<encoded appName>`, cut at 64 characters and suffixed
/// `-<first 10 hex of sha256(runner:appName)>`; `None` for an unknown runner, an unclean appName
/// or a name that does not survive [`sanitize_bottle_name`].
pub fn per_game_bottle_name(runner: &str, app_name: &str) -> Option<String> {
    engine_key_for(runner, app_name)?;
    let mut name = format!("{PREFIX}-{runner}-{}", encode_app_name(app_name));
    if name.len() > PER_GAME_BOTTLE_NAME_MAX {
        let digest = Sha256::digest(format!("{runner}:{app_name}").as_bytes());
        let hex: String = digest.iter().map(|b| format!("{b:02x}")).collect();
        let keep = PER_GAME_BOTTLE_NAME_MAX - HASH_HEX - 1;
        // The name is ASCII by construction, so a byte index is a character index.
        name = format!("{}-{}", &name[..keep], &hex[..HASH_HEX]);
    }
    (sanitize_bottle_name(&name).as_deref() == Some(name.as_str())).then_some(name)
}

/// A valid, non-bottle-runtime identity out of an untyped argument (`asNonSteamIdentity`).
pub fn as_non_steam_identity(args: &Value) -> Option<(String, String)> {
    let object = args.as_object()?;
    let runner = object.get("runner")?.as_str()?;
    let app_name = object.get("appName")?.as_str()?;
    engine_key_for(runner, app_name)?;
    if uses_bottle_runtime(runner) {
        return None;
    }
    Some((runner.to_string(), app_name.to_string()))
}

/// `getPerGameBottleNameFor`: the per-game bottle name for the install dialogs, or `None` for an
/// invalid or Steam game. Garbage arguments answer `None`, never an error.
pub fn per_game_bottle_name_for(args: &Value) -> Option<String> {
    let (runner, app_name) = as_non_steam_identity(args)?;
    per_game_bottle_name(&runner, &app_name)
}

/// One row of the engine picker (`EngineOption`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineOption {
    pub id: String,
    pub kind: &'static str,
    pub label: String,
    pub available: bool,
    pub installed: bool,
    pub is_previous_pin: bool,
}

fn option(
    id: String,
    kind: &'static str,
    label: String,
    available: bool,
    installed: bool,
    is_previous_pin: bool,
) -> EngineOption {
    EngineOption {
        id,
        kind,
        label,
        available,
        installed,
        is_previous_pin,
    }
}

/// `/-DXMT$|gptk|toolkit/i`.
fn is_unusable_release_name(version: &str) -> bool {
    let lower = version.to_lowercase();
    lower.ends_with("-dxmt") || lower.contains("gptk") || lower.contains("toolkit")
}

/// `listEngineOverrideOptions`: Automatic, CrossOver (installed or not), the current pin and the
/// previous one when there is one, then every installed Wine Manager macOS build the grammar
/// accepts. GPTK, toolkit and DXMT builds and custom paths are never offered (D-11).
pub async fn list_engine_override_options(ctx: &EngineCtx) -> Vec<EngineOption> {
    let mut out = vec![option(
        "automatic".to_string(),
        "automatic",
        "Automatic".to_string(),
        true,
        true,
        false,
    )];
    let crossover = (ctx.crossover_bin_dir)().await.is_some();
    out.push(option(
        "crossover".to_string(),
        "crossover",
        "CrossOver".to_string(),
        crossover,
        crossover,
        false,
    ));
    if let Ok(table) = pins() {
        for (pin, previous) in std::iter::once((&table.current, false))
            .chain(table.previous.as_ref().map(|p| (p, true)))
        {
            out.push(option(
                format!("pinned:{}", pin.id),
                "pinned",
                pin.label.clone(),
                true,
                is_pinned_engine_installed(ctx, pin),
                previous,
            ));
        }
    }
    for release in wine_manager_releases(ctx) {
        if !is_installed_macos_release(&release) {
            continue;
        }
        let version = prop(&release, "version").map_or("undefined".to_string(), js_to_string);
        if is_unusable_release_name(&version) {
            continue;
        }
        let id = format!("wine-manager:{version}");
        if parse_engine_override_str(&id) == "automatic" {
            continue;
        }
        out.push(option(
            id,
            "wine-manager",
            format!("Wine Manager: {version}"),
            true,
            true,
            false,
        ));
    }
    out
}

/// A read-only `Legacy: <name>` row while the game (or the global default) is on Legacy. The id is
/// display only: the write guard rejects it, so it can never be saved (D-07).
fn legacy_entry(effective: &EffectiveEngine) -> Option<EngineOption> {
    let EffectiveEngine::Legacy { label } = effective else {
        return None;
    };
    Some(option(
        engine_id_of(effective),
        "legacy",
        format!(
            "Legacy: {}",
            label.as_ref().map_or("undefined".to_string(), js_to_string)
        ),
        false,
        true,
        false,
    ))
}

/// `listGameEngineOptions`: the picker's rows, plus the Legacy row when `args` names a game (or
/// `{appName: 'default'}`, the global default) that is on Legacy. Any other argument shape answers
/// the plain list.
pub async fn list_game_engine_options(ctx: &EngineCtx, args: &Value) -> Vec<EngineOption> {
    let mut options = list_engine_override_options(ctx).await;
    let effective = match args.as_object() {
        None => None,
        Some(object) => {
            if !object.contains_key("runner")
                && object.get("appName").and_then(Value::as_str) == Some("default")
            {
                Some(resolve_global_engine(ctx, &global_settings(ctx)))
            } else {
                as_non_steam_identity(args)
                    .map(|(runner, app_name)| read_engine_for_game(ctx, &runner, &app_name))
            }
        }
    };
    if let Some(legacy) = effective.as_ref().and_then(legacy_entry) {
        options.push(legacy);
    }
    options
}

/// `getDefaultEngine` (D-09): the global default engine, derived or stored, Legacy included.
#[derive(Debug, Clone, PartialEq)]
pub struct DefaultEngine {
    pub effective_engine_id: String,
    pub stored: bool,
    /// The Legacy Wine's label; `None` when the default is not Legacy (and when a Legacy Wine named
    /// nothing, which the TS payload leaves out).
    pub legacy_label: Option<Value>,
    pub is_legacy: bool,
}

impl DefaultEngine {
    /// The JSON payload of `getDefaultEngine`.
    pub fn to_value(&self) -> Value {
        let mut out = serde_json::Map::new();
        out.insert(
            "effectiveEngineId".to_string(),
            json!(self.effective_engine_id),
        );
        out.insert(
            "engineSource".to_string(),
            json!(if self.stored { "stored" } else { "derived" }),
        );
        if !self.is_legacy {
            out.insert("legacyLabel".to_string(), Value::Null);
        } else if let Some(label) = &self.legacy_label {
            out.insert("legacyLabel".to_string(), label.clone());
        }
        Value::Object(out)
    }
}

pub fn default_engine(ctx: &EngineCtx) -> DefaultEngine {
    let effective = resolve_global_engine(ctx, &global_settings(ctx));
    DefaultEngine {
        effective_engine_id: engine_id_of(&effective),
        stored: matches!(
            effective,
            EffectiveEngine::Override {
                source: EngineSource::Stored,
                ..
            }
        ),
        is_legacy: matches!(effective, EffectiveEngine::Legacy { .. }),
        legacy_label: match effective {
            EffectiveEngine::Legacy { label } => label,
            EffectiveEngine::Override { .. } => None,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn the_name_is_the_runner_and_the_encoded_app_name() {
        assert_eq!(
            per_game_bottle_name("gog", "1234").as_deref(),
            Some("GameLib-gog-1234")
        );
        assert_eq!(
            per_game_bottle_name("gog", "My Game").as_deref(),
            Some("GameLib-gog-My_20Game")
        );
        // A lone dot stays; a dot in a run is escaped so `..` cannot appear.
        assert_eq!(
            per_game_bottle_name("gog", "a.b").as_deref(),
            Some("GameLib-gog-a.b")
        );
        assert_eq!(per_game_bottle_name("gog", "a..b"), None);
        assert_eq!(
            per_game_bottle_name("steam", "620").as_deref(),
            Some("GameLib-steam-620")
        );
        assert_eq!(per_game_bottle_name("nope", "1"), None);
    }

    #[test]
    fn a_long_name_is_cut_and_hash_suffixed() {
        let name = per_game_bottle_name("gog", &"a".repeat(100)).unwrap();
        assert_eq!(name.len(), PER_GAME_BOTTLE_NAME_MAX);
        assert!(name.starts_with("GameLib-gog-aaa"));
        let (_, suffix) = name.rsplit_once('-').unwrap();
        assert_eq!(suffix.len(), HASH_HEX);
    }

    #[test]
    fn the_for_variant_swallows_garbage_and_never_names_steam() {
        assert_eq!(
            per_game_bottle_name_for(&json!({"runner": "gog", "appName": "1234"})).as_deref(),
            Some("GameLib-gog-1234")
        );
        for bad in [
            json!(null),
            json!("x"),
            json!(5),
            json!([]),
            json!({}),
            json!({"runner": "steam", "appName": "620"}),
            json!({"runner": 5, "appName": "1"}),
        ] {
            assert_eq!(per_game_bottle_name_for(&bad), None, "{bad}");
        }
    }

    #[test]
    fn sanitize_trims_and_refuses_separators() {
        assert_eq!(sanitize_bottle_name(" a ").as_deref(), Some("a"));
        assert_eq!(sanitize_bottle_name(""), None);
        assert_eq!(sanitize_bottle_name("a/b"), None);
        assert_eq!(sanitize_bottle_name("a..b"), None);
    }
}
