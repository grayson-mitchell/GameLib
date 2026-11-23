//! The engine key and its read-time migration (Phase 61 D-05..D-09, ported from `engineConfig.ts`).
//!
//! `GameSettings.engineOverride` holds a closed-grammar id (`ids`) for every store. A game with no
//! key gets its engine derived from its stored `wineVersion` on every read; nothing is ever written
//! here (D-08). Legacy is never a stored value: it is a derived variant for a Wine outside the
//! option list.
//!
//! `GamesConfig/<app>.json` and `config.json` are read through the StoreHost (T-87-73), never with
//! file I/O of this crate's own: the host's view is the one the shell writes through, so a setting
//! written a moment ago is seen. Values are unvalidated JSON and are treated as such.

use std::path::Path;

use gamelib_store::json::Json;
use serde::Serialize;
use serde_json::{Map, Value};

use crate::ctx::{EngineCtx, Platform};
use crate::engines::pinned_engine_paths;
use crate::engines::{is_installed_macos_release, release_bin_dir, wine_manager_releases};
use crate::ids::{parse_engine_override, parse_engine_override_str, AUTOMATIC};
use crate::jsutil::{js_to_string, js_truthy, path_join, prop, utf16_len};
use crate::key::uses_bottle_runtime;
use crate::pins::pins;

/// Whether the engine was stored in the config or derived from the Wine.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum EngineSource {
    Stored,
    Derived,
}

/// The engine a game or the global default is on (`EffectiveEngine`).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum EffectiveEngine {
    Override {
        id: String,
        source: EngineSource,
    },
    /// A Wine outside the option list. `label` is whatever the stored Wine called itself: absent
    /// when it named nothing (`undefined` in the TS), any JSON otherwise.
    Legacy {
        #[serde(skip_serializing_if = "Option::is_none")]
        label: Option<Value>,
    },
}

const AUTOMATIC_DERIVED: fn() -> EffectiveEngine = || EffectiveEngine::Override {
    id: AUTOMATIC.to_string(),
    source: EngineSource::Derived,
};

fn stored_override(id: String) -> EffectiveEngine {
    EffectiveEngine::Override {
        id,
        source: EngineSource::Stored,
    }
}

impl EffectiveEngine {
    /// The JSON the TS answered (`{kind, id, source}` or `{kind, label}`).
    pub fn to_value(&self) -> Value {
        serde_json::to_value(self).unwrap_or(Value::Null)
    }
}

/// `engineIdOf`: the override id, or `legacy:<label>` for display only. Never parse this back into
/// a launch path.
pub fn engine_id_of(engine: &EffectiveEngine) -> String {
    match engine {
        EffectiveEngine::Override { id, .. } => id.clone(),
        EffectiveEngine::Legacy { label } => format!(
            "legacy:{}",
            label.as_ref().map_or("undefined".to_string(), js_to_string)
        ),
    }
}

/// `engineIdOf` over an untyped engine object, as a golden hands it.
pub fn engine_id_of_value(engine: &Value) -> String {
    if prop(engine, "kind").and_then(Value::as_str) == Some("override") {
        return prop(engine, "id").map_or("undefined".to_string(), js_to_string);
    }
    format!(
        "legacy:{}",
        prop(engine, "label").map_or("undefined".to_string(), js_to_string)
    )
}

/// `isWritableEngineOverride`: true only for a value that survives the closed grammar unchanged.
pub fn is_writable_engine_override(value: &Value) -> bool {
    match value.as_str() {
        Some(text) => parse_engine_override_str(text) == text,
        None => false,
    }
}

/// The document at `path` opened through the host, as its top-level entries. A missing file, an
/// unreadable one or a refused key has no entries.
fn read_doc(ctx: &EngineCtx, key: &str, path: &Path) -> Option<Vec<(String, Json)>> {
    if !path.exists() {
        return None;
    }
    let store = ctx.host.open_doc(key, path.to_path_buf()).ok()?;
    Some(store.snapshot())
}

/// `readStoredGameConfig`: the game's stored GamesConfig entry. `None` on a bad appName, a missing
/// or corrupt file, or an entry that is not an object. Never creates a file (59-UAT G11).
pub fn read_stored_game_config(ctx: &EngineCtx, app_name: &str) -> Option<Map<String, Value>> {
    let len = utf16_len(app_name);
    if !(1..=255).contains(&len) || app_name == ".." || app_name.contains(['/', '\\', '\0']) {
        return None;
    }
    let path = ctx
        .paths
        .app_folder
        .join("GamesConfig")
        .join(format!("{app_name}.json"));
    let entries = read_doc(ctx, &format!("GamesConfig/{app_name}"), &path)?;
    let entry = entries
        .into_iter()
        .find(|(key, _)| key == app_name)
        .map(|(_, value)| value.to_value())?;
    match entry {
        Value::Object(map) => Some(map),
        _ => None,
    }
}

/// The global settings the engine layer reads: `config.json`'s `defaultSettings` over the factory
/// default Wine. A profile that never picked a Wine has the PATH default (D-25 (b)), reported by
/// the `default_wine` hook the shell fills from `gamelib-wine`; the TS factory default is an empty
/// object on Windows, so there the key stays absent.
pub fn global_settings(ctx: &EngineCtx) -> Map<String, Value> {
    let path = ctx.paths.app_folder.join("config.json");
    let mut settings = read_doc(ctx, "settings/global", &path)
        .and_then(|entries| {
            entries
                .into_iter()
                .find(|(key, _)| key == "defaultSettings")
                .map(|(_, value)| value.to_value())
        })
        .and_then(|value| match value {
            Value::Object(map) => Some(map),
            _ => None,
        })
        .unwrap_or_default();
    if !settings.contains_key("wineVersion") && ctx.platform != Platform::Windows {
        if let Some(wine) = (ctx.default_wine)() {
            if let Ok(value) = serde_json::to_value(wine) {
                settings.insert("wineVersion".to_string(), value);
            }
        }
    }
    settings
}

/// `deriveEngineFromWine` (D-05..D-07, D-15): the override a stored Wine corresponds to, or Legacy.
pub fn derive_engine_from_wine(ctx: &EngineCtx, wine: Option<&Value>) -> EffectiveEngine {
    let Some(wine) = wine.filter(|w| w.is_object() || w.is_array()) else {
        return AUTOMATIC_DERIVED();
    };
    let kind = prop(wine, "type");
    if kind.and_then(Value::as_str) == Some("crossover") {
        return AUTOMATIC_DERIVED();
    }
    // `wine.name || wine.type`
    let label = match prop(wine, "name") {
        Some(name) if js_truthy(name) => Some(name.clone()),
        _ => kind.cloned(),
    };
    let bin = prop(wine, "bin").and_then(Value::as_str);
    let (true, Some(bin)) = (kind.and_then(Value::as_str) == Some("wine"), bin) else {
        return EffectiveEngine::Legacy { label };
    };
    if let Ok(table) = pins() {
        for pin in std::iter::once(&table.current).chain(table.previous.as_ref()) {
            if bin == pinned_engine_paths(ctx, pin).wine_bin {
                return EffectiveEngine::Override {
                    id: parse_engine_override_str(&format!("pinned:{}", pin.id)),
                    source: EngineSource::Derived,
                };
            }
        }
    }
    let release = wine_manager_releases(ctx).into_iter().find(|r| {
        is_installed_macos_release(r)
            && release_bin_dir(r).is_some_and(|dir| path_join(&[&dir, "wine"]) == bin)
    });
    if let Some(release) = release {
        let version = prop(&release, "version").map_or("undefined".to_string(), js_to_string);
        let id = parse_engine_override_str(&format!("wine-manager:{version}"));
        if id != AUTOMATIC {
            return EffectiveEngine::Override {
                id,
                source: EngineSource::Derived,
            };
        }
    }
    EffectiveEngine::Legacy { label }
}

/// How `resolve_effective_engine` reads a missing key.
pub struct ResolveOptions<'a> {
    /// A second key an older build stored the override under (`steamEngineOverride`).
    pub legacy_key: Option<&'a str>,
    /// Derive from the Wine when no key is stored.
    pub derive: bool,
}

/// `resolveEffectiveEngine`: a stored string key (even one outside the grammar) wins; then the
/// legacy key; then, when `derive`, the entry's own Wine or the inherited one.
pub fn resolve_effective_engine(
    ctx: &EngineCtx,
    entry: Option<&Map<String, Value>>,
    inherited: Option<&Value>,
    opts: &ResolveOptions<'_>,
) -> EffectiveEngine {
    if let Some(stored) = entry
        .and_then(|e| e.get("engineOverride"))
        .and_then(Value::as_str)
    {
        return stored_override(parse_engine_override_str(stored));
    }
    let legacy = opts
        .legacy_key
        .filter(|key| !key.is_empty())
        .and_then(|key| entry.and_then(|e| e.get(key)))
        .and_then(Value::as_str);
    if let Some(legacy) = legacy {
        return stored_override(parse_engine_override_str(legacy));
    }
    if opts.derive {
        // `entry?.wineVersion ?? inheritedWine`
        let own = entry
            .and_then(|e| e.get("wineVersion"))
            .filter(|w| !w.is_null());
        return derive_engine_from_wine(ctx, own.or(inherited));
    }
    AUTOMATIC_DERIVED()
}

/// `readEngineForGame` (CR-05): the single source of truth for a game's engine. A global Engine pick
/// reaches games only through new installs (D-09); an existing game with no key derives from its own
/// or the inherited global `wineVersion`. A bottle-runtime store never derives.
pub fn read_engine_for_game(ctx: &EngineCtx, runner: &str, app_name: &str) -> EffectiveEngine {
    let entry = read_stored_game_config(ctx, app_name);
    if uses_bottle_runtime(runner) {
        return resolve_effective_engine(
            ctx,
            entry.as_ref(),
            None,
            &ResolveOptions {
                legacy_key: Some("steamEngineOverride"),
                derive: false,
            },
        );
    }
    let inherited = match entry
        .as_ref()
        .is_some_and(|e| e.contains_key("wineVersion"))
    {
        true => None,
        false => global_settings(ctx).get("wineVersion").cloned(),
    };
    resolve_effective_engine(
        ctx,
        entry.as_ref(),
        inherited.as_ref(),
        &ResolveOptions {
            legacy_key: None,
            derive: true,
        },
    )
}

/// `resolveGlobalEngine` (D-09): the global default derives the same way as a game.
pub fn resolve_global_engine(ctx: &EngineCtx, settings: &Map<String, Value>) -> EffectiveEngine {
    if let Some(stored) = settings.get("engineOverride").and_then(Value::as_str) {
        return stored_override(parse_engine_override(&Value::String(stored.to_string())));
    }
    derive_engine_from_wine(ctx, settings.get("wineVersion"))
}
