//! The settings the Wine tools (Winetricks run and installed-list, Run EXE in prefix) act on, outside
//! any launch (Phase 61 D-02, D-04, D-07, D-13, ported from `toolSettings.ts` and the settings
//! builders of `launchSettings.ts` / `bottlePrimitives.ts`).
//!
//! The question is "which bottle or prefix, on which engine, does this game run in right now",
//! answered from the same inputs the launch uses. The resolver is read-only with respect to the game
//! and its engine: it never runs the CrossOver pre-flight, never switches a bottle's engine, never
//! writes the game's config. Its one side effect is `ensure_game_bottle`, and only when the caller
//! says running the tool is a need that creates the bottle (D-01, D-03); a read passes
//! `ensure_bottle: false`.
//!
//! The in-memory half (a live engine selection and its launch overlay) and the bottle creation arrive
//! through [`ToolSettingsDeps`]. The default [`CtxToolSettingsDeps`] reads all of it from the context
//! (87-56a, D-23): the live selection from `ctx.registry`, the per-launch overlay from
//! `ctx.launch_settings`, and a missing bottle is created through the same per-game flight a launch
//! uses (the creation engine is decided first). A Winetricks apply or a Run EXE during a live
//! non-Steam launch on a fallback engine therefore acts on the launch's engine, not on the stored
//! override's.

use gamelib_core::process::BoxFuture;
use serde_json::{json, Map, Value};

use crate::bottles::per_game::{EnsureArgs, EnsureOutcome};
use crate::config::{read_engine_for_game, EffectiveEngine};
use crate::ctx::{EngineCtx, Platform};
use crate::engines::{
    bottle_dir, is_bottle_provisioned, is_pinned_engine_installed, pin_engine,
    read_bottle_engine_marker_kind, resolve_wine_manager_staging, NonCrossoverEngine,
};
use crate::game_prefix::{resolve_game_prefix, BottleOrigin, GamePrefix};
use crate::jsutil::path_join;
use crate::key::{engine_key_for, engine_key_if_eligible, uses_bottle_runtime, GameIdentity};
use crate::launch::step::{CtxStepDeps, Fut, StepDeps};
use crate::offline::MarkerKind;
use crate::pins::pins;

/// The env keys a non-CrossOver bottle's settings take from the engine, not from the game
/// (`FALLBACK_STRIPPED_ENV_KEYS`).
const FALLBACK_STRIPPED_ENV_KEYS: [&str; 8] = [
    "USER",
    "WINEPREFIX",
    "CX_BOTTLE",
    "CX_ROOT",
    "WINELOADER",
    "WINESERVER",
    "WINEDEBUG",
    "MVK_CONFIG_LOG_LEVEL",
];

/// Why there are no tool settings (`ToolSettingsResult.reason`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Unavailable {
    BottleNotCreated,
    NoEngine,
    InvalidPrefix,
    /// A bottle-runtime title whose tools would act on a bottle shared with other titles.
    NotOwnBottle,
}

impl Unavailable {
    pub fn as_str(self) -> &'static str {
        match self {
            Unavailable::BottleNotCreated => "bottle-not-created",
            Unavailable::NoEngine => "no-engine",
            Unavailable::InvalidPrefix => "invalid-prefix",
            Unavailable::NotOwnBottle => "not-own-bottle",
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum ToolSettingsResult {
    /// The game's own stored settings.
    Stored {
        settings: Value,
    },
    /// The settings that run the tool on the game's engine.
    Engine {
        key: String,
        settings: Value,
    },
    Unavailable {
        reason: Unavailable,
    },
}

impl ToolSettingsResult {
    /// The JSON the TS answered.
    pub fn to_value(&self) -> Value {
        match self {
            ToolSettingsResult::Stored { settings } => {
                json!({"kind": "stored", "settings": settings})
            }
            ToolSettingsResult::Engine { key, settings } => {
                json!({"kind": "engine", "key": key, "settings": settings})
            }
            ToolSettingsResult::Unavailable { reason } => {
                json!({"kind": "unavailable", "reason": reason.as_str()})
            }
        }
    }
}

/// What the bottle flight needs (`ensureGameBottle`'s arguments).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EnsureBottleRequest {
    pub key: String,
    pub bottle_name: String,
    pub app_name: String,
    pub runner: String,
}

/// The collaborators the resolver reads (`ToolSettingsDeps`).
pub trait ToolSettingsDeps: Send + Sync {
    /// A game is running (or starting) on a chosen engine.
    fn has_live_selection(&self, key: &str) -> bool;
    /// The per-launch overlay of the live selection over the stored settings.
    fn overlay(&self, key: &str, stored: &Value) -> Value;
    fn is_provisioned(&self, bottle_name: &str) -> bool;
    /// Creates the per-game bottle; `true` when it exists afterwards. The future may borrow the deps
    /// (the context-backed creation reads the context it was built over).
    fn ensure_game_bottle<'a>(&'a self, request: EnsureBottleRequest) -> Fut<'a, bool>;
    fn marker_kind(&self, bottle_name: &str) -> Option<MarkerKind>;
    fn crossover_bin_dir(&self) -> BoxFuture<Option<String>>;
    /// The built-in or Wine Manager engine an engine id runs on; `None` when it is not installed.
    fn non_crossover_engine(&self, engine_id: &str) -> Option<NonCrossoverEngine>;
}

/// The deps a context supplies on its own (see the module comment for what is not yet wired).
pub struct CtxToolSettingsDeps<'a> {
    ctx: &'a EngineCtx,
}

impl<'a> CtxToolSettingsDeps<'a> {
    pub fn new(ctx: &'a EngineCtx) -> CtxToolSettingsDeps<'a> {
        CtxToolSettingsDeps { ctx }
    }
}

/// `nonCrossoverEngineFor`: a Wine Manager build, or the pin named (the current one for `automatic`
/// ids), when it is installed.
pub fn non_crossover_engine_for(ctx: &EngineCtx, engine_id: &str) -> Option<NonCrossoverEngine> {
    if let Some(version) = engine_id.strip_prefix("wine-manager:") {
        return resolve_wine_manager_staging(ctx, version);
    }
    let table = pins().ok()?;
    let wanted = engine_id
        .strip_prefix("pinned:")
        .unwrap_or(table.current.id.as_str());
    let pin = std::iter::once(&table.current)
        .chain(table.previous.as_ref())
        .find(|p| p.id == wanted)?;
    is_pinned_engine_installed(ctx, pin).then(|| pin_engine(ctx, pin))
}

impl ToolSettingsDeps for CtxToolSettingsDeps<'_> {
    fn has_live_selection(&self, key: &str) -> bool {
        self.ctx.registry.get_engine_selection(key).is_some()
    }

    fn overlay(&self, key: &str, stored: &Value) -> Value {
        self.ctx
            .launch_settings
            .get_launch_settings(self.ctx, Some(key), stored)
    }

    fn is_provisioned(&self, bottle_name: &str) -> bool {
        is_bottle_provisioned(self.ctx, bottle_name)
    }

    fn ensure_game_bottle<'a>(&'a self, request: EnsureBottleRequest) -> Fut<'a, bool> {
        Box::pin(async move {
            let args = EnsureArgs {
                key: request.key,
                bottle_name: request.bottle_name,
                app_name: request.app_name,
                runner: request.runner,
                cancel: None,
            };
            matches!(
                CtxStepDeps.ensure_game_bottle(self.ctx, &args).await,
                EnsureOutcome::Done { .. }
            )
        })
    }

    fn marker_kind(&self, bottle_name: &str) -> Option<MarkerKind> {
        read_bottle_engine_marker_kind(self.ctx, bottle_name)
    }

    fn crossover_bin_dir(&self) -> BoxFuture<Option<String>> {
        (self.ctx.crossover_bin_dir)()
    }

    fn non_crossover_engine(&self, engine_id: &str) -> Option<NonCrossoverEngine> {
        non_crossover_engine_for(self.ctx, engine_id)
    }
}

fn settings_map(value: &Value) -> Map<String, Value> {
    value.as_object().cloned().unwrap_or_default()
}

/// `buildCrossoverGameSettings`: settings that run `bottle_name` on CrossOver.
pub fn build_crossover_game_settings(
    stored: &Value,
    bottle_name: &str,
    bin_dir: &str,
    build: Option<&str>,
) -> Value {
    let mut out = settings_map(stored);
    out.insert("wineCrossoverBottle".to_string(), json!(bottle_name));
    out.insert(
        "wineVersion".to_string(),
        json!({
            "type": "crossover",
            "bin": path_join(&[bin_dir, "wine"]),
            "name": build.map_or("CrossOver".to_string(), |b| format!("CrossOver {b}")),
            "wineserver": path_join(&[bin_dir, "wineserver"]),
        }),
    );
    Value::Object(out)
}

/// `buildPlainPrefixSettings` (D-04, D-06): a plain prefix keeps its prefix and DXVK settings; only
/// the Wine changes.
pub fn build_plain_prefix_settings(stored: &Value, engine: &NonCrossoverEngine) -> Value {
    let mut out = settings_map(stored);
    out.insert(
        "wineVersion".to_string(),
        json!({
            "type": "wine",
            "bin": engine.wine_bin,
            "name": engine.label,
            "wineserver": engine.wineserver_bin,
        }),
    );
    Value::Object(out)
}

/// `buildFallbackGameSettings` (Phase 59 D-01): settings that run a bottle on a non-CrossOver engine.
/// DXVK is managed by the engine switch, never by the generic auto-install.
pub fn build_fallback_game_settings(
    ctx: &EngineCtx,
    bottle_name: &str,
    engine: &NonCrossoverEngine,
    base: &Value,
) -> Value {
    let mut out = settings_map(base);
    let kept = base
        .get("enviromentOptions")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter(|entry| {
                    let key = entry
                        .get("key")
                        .map_or("undefined".to_string(), crate::jsutil::js_to_string);
                    !FALLBACK_STRIPPED_ENV_KEYS.contains(&key.to_uppercase().as_str())
                })
                .cloned()
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    out.insert("wineCrossoverBottle".to_string(), json!(bottle_name));
    out.insert(
        "winePrefix".to_string(),
        json!(bottle_dir(ctx, bottle_name)),
    );
    out.insert(
        "wineVersion".to_string(),
        json!({
            "type": "wine",
            "bin": engine.wine_bin,
            "name": engine.label,
            "wineserver": engine.wineserver_bin,
        }),
    );
    out.insert("autoInstallDxvk".to_string(), json!(false));
    out.insert("autoInstallDxvkNvapi".to_string(), json!(false));
    out.insert("autoInstallVkd3d".to_string(), json!(false));
    let mut env = kept;
    // Wine-Staging takes its profile name from USER; USER keeps C:\users\crossover.
    env.push(json!({"key": "USER", "value": "crossover"}));
    env.push(json!({"key": "WINEDEBUG", "value": "-all"}));
    env.push(json!({"key": "MVK_CONFIG_LOG_LEVEL", "value": "0"}));
    out.insert("enviromentOptions".to_string(), Value::Array(env));
    Value::Object(out)
}

/// A game that may have no library entry yet (a sideload whose installer is about to run).
#[derive(Debug, Clone)]
pub struct ToolGameId<'a> {
    pub runner: &'a str,
    pub app_name: &'a str,
    /// The install platform (`Browser` is never engine-controlled).
    pub platform: Option<&'a str>,
}

/// `resolveToolSettings`: a native game, a Browser install, a non-macOS host and a bottle-runtime
/// store keep their stored settings; any other game is resolved by [`resolve_tool_settings_for_id`].
pub async fn resolve_tool_settings(
    ctx: &EngineCtx,
    deps: &dyn ToolSettingsDeps,
    game: &GameIdentity<'_>,
    stored: &Value,
    ensure_bottle: bool,
) -> ToolSettingsResult {
    if engine_key_if_eligible(game, ctx.platform == Platform::Mac).is_none() {
        return ToolSettingsResult::Stored {
            settings: stored.clone(),
        };
    }
    resolve_tool_settings_for_id(
        ctx,
        deps,
        &ToolGameId {
            runner: game.runner,
            app_name: game.app_name,
            platform: game.install_platform,
        },
        stored,
        ensure_bottle,
    )
    .await
}

/// `resolveToolSettingsForId` (CR-04): the same answer as [`resolve_tool_settings`] for a game that
/// has no library entry yet. Here a game is eligible when it is on macOS, not a Browser install and
/// not a bottle-runtime store.
pub async fn resolve_tool_settings_for_id(
    ctx: &EngineCtx,
    deps: &dyn ToolSettingsDeps,
    id: &ToolGameId<'_>,
    stored: &Value,
    ensure_bottle: bool,
) -> ToolSettingsResult {
    let keep_stored = || ToolSettingsResult::Stored {
        settings: stored.clone(),
    };
    let key = if ctx.platform != Platform::Mac
        || id.platform == Some("Browser")
        || uses_bottle_runtime(id.runner)
    {
        None
    } else {
        engine_key_for(id.runner, id.app_name)
    };
    let Some(key) = key else {
        return keep_stored();
    };

    // A game is running (or starting) on a chosen engine: a tool targets that engine.
    if deps.has_live_selection(&key) {
        let settings = deps.overlay(&key, stored);
        return ToolSettingsResult::Engine { key, settings };
    }

    let effective = read_engine_for_game(ctx, id.runner, id.app_name);
    // D-07: a legacy game keeps its stored settings.
    let EffectiveEngine::Override { id: engine_id, .. } = &effective else {
        return keep_stored();
    };
    let prefix = resolve_game_prefix(id.runner, id.app_name, stored, &effective);
    let (bottle_name, origin) = match prefix {
        GamePrefix::Legacy => return keep_stored(),
        GamePrefix::Invalid => {
            return ToolSettingsResult::Unavailable {
                reason: Unavailable::InvalidPrefix,
            }
        }
        GamePrefix::Plain { .. } => {
            // D-04, D-06: the prefix stays; only the Wine is the pinned or Wine Manager build.
            let Some(engine) = deps.non_crossover_engine(engine_id) else {
                return ToolSettingsResult::Unavailable {
                    reason: Unavailable::NoEngine,
                };
            };
            let settings = build_plain_prefix_settings(stored, &engine);
            return ToolSettingsResult::Engine { key, settings };
        }
        GamePrefix::Bottle {
            bottle_name,
            origin,
            ..
        } => (bottle_name, origin),
    };

    if !deps.is_provisioned(&bottle_name) {
        // A legacy shared bottle is never created by the engine layer (D-02).
        if !ensure_bottle || origin == BottleOrigin::LegacyCrossover {
            return ToolSettingsResult::Unavailable {
                reason: Unavailable::BottleNotCreated,
            };
        }
        let made = deps
            .ensure_game_bottle(EnsureBottleRequest {
                key: key.clone(),
                bottle_name: bottle_name.clone(),
                app_name: id.app_name.to_string(),
                runner: id.runner.to_string(),
            })
            .await;
        if !made {
            return ToolSettingsResult::Unavailable {
                reason: Unavailable::BottleNotCreated,
            };
        }
    }

    // The bottle's current engine is what its marker says; a tool must not flip it.
    let marker = deps.marker_kind(&bottle_name);
    let wants_non_crossover = marker == Some(MarkerKind::NonCrossover)
        || engine_id.starts_with("pinned:")
        || engine_id.starts_with("wine-manager:");
    if marker != Some(MarkerKind::NonCrossover) && !wants_non_crossover {
        if let Some(bin_dir) = deps.crossover_bin_dir().await.filter(|d| !d.is_empty()) {
            let settings = build_crossover_game_settings(stored, &bottle_name, &bin_dir, None);
            return ToolSettingsResult::Engine { key, settings };
        }
    }

    let Some(engine) = deps.non_crossover_engine(engine_id) else {
        return ToolSettingsResult::Unavailable {
            reason: Unavailable::NoEngine,
        };
    };
    let settings = build_fallback_game_settings(ctx, &bottle_name, &engine, stored);
    ToolSettingsResult::Engine { key, settings }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bottles::registry::EngineSelection;
    use crate::ctx::EnginePaths;
    use crate::launch::settings::OverlayContext;
    use gamelib_core::clock::SystemClock;
    use gamelib_core::shutdown::Shutdown;
    use gamelib_store::host::StoreHost;
    use gamelib_testutil::FakeHome;
    use std::path::Path;
    use std::sync::Arc;

    fn ctx(home: &FakeHome) -> EngineCtx {
        let root = home.root().to_path_buf();
        EngineCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            Platform::Mac,
            EnginePaths {
                app_folder: root.clone(),
                user_data: root.clone(),
                tools_path: root.join("tools"),
                user_home: root.join("home"),
                temp: root.join("temp"),
            },
            Shutdown::new(),
        )
    }

    /// A selection whose two binaries exist (the registry refuses one that has none).
    fn fallback_selection(home: &FakeHome, label: &str) -> EngineSelection {
        let dir = home.root().join("engine").join(label);
        std::fs::create_dir_all(&dir).unwrap();
        let wine = dir.join("wine");
        let wineserver = dir.join("wineserver");
        std::fs::write(&wine, b"").unwrap();
        std::fs::write(&wineserver, b"").unwrap();
        EngineSelection::Pinned {
            pin_id: "pin-1".to_string(),
            reason: "cx-missing".to_string(),
            engine: NonCrossoverEngine {
                wine_bin: wine.to_string_lossy().into_owned(),
                wineserver_bin: wineserver.to_string_lossy().into_owned(),
                label: label.to_string(),
                version: "1".to_string(),
                dxvk: None,
            },
        }
    }

    fn gog() -> ToolGameId<'static> {
        ToolGameId {
            runner: "gog",
            app_name: "1",
            platform: Some("Windows"),
        }
    }

    /// 87-52 regression (D-23): the deps answered "no live selection" at 87-56a's HEAD, so a Winetricks
    /// apply or a Run EXE during a live non-Steam launch on a fallback engine acted on the stored
    /// override's engine (or the stored settings), not the launch's.
    #[tokio::test]
    async fn a_live_selection_wins_over_the_stored_override() {
        let home = FakeHome::new("engine-tool-settings-live-");
        let ctx = ctx(&home);
        let selection = fallback_selection(&home, "Fallback Wine");
        let wine_bin = selection.engine().unwrap().wine_bin.clone();
        assert!(ctx
            .registry
            .set_engine_selection_quiet(None, "gog:1", selection));
        ctx.launch_settings
            .set_launch_overlay_context("gog:1", OverlayContext::bottle("GameLib-gog-1", None));
        let stored = json!({"winePrefix": "/old", "wineVersion": {"type": "crossover", "bin": "/cx/bin/wine"}});
        let deps = CtxToolSettingsDeps::new(&ctx);
        assert!(deps.has_live_selection("gog:1"));
        let answer = resolve_tool_settings_for_id(&ctx, &deps, &gog(), &stored, false).await;
        let ToolSettingsResult::Engine { key, settings } = answer else {
            panic!("a live selection answers engine settings, got {answer:?}");
        };
        assert_eq!(key, "gog:1");
        assert_eq!(settings["wineVersion"]["bin"], json!(wine_bin));
        assert_eq!(settings["wineVersion"]["name"], "Fallback Wine");
        assert_eq!(settings["wineCrossoverBottle"], "GameLib-gog-1");
        assert_eq!(settings["autoInstallDxvk"], false);
        assert_eq!(
            stored["wineVersion"]["bin"], "/cx/bin/wine",
            "the stored settings are never changed"
        );

        // A plain prefix keeps its prefix; only the Wine is the live engine's.
        ctx.launch_settings
            .set_launch_overlay_context("gog:1", OverlayContext::plain());
        let ToolSettingsResult::Engine { settings, .. } =
            resolve_tool_settings_for_id(&ctx, &deps, &gog(), &stored, false).await
        else {
            panic!("a plain prefix still answers engine settings");
        };
        assert_eq!(settings["winePrefix"], "/old");
        assert_eq!(settings["wineVersion"]["bin"], json!(wine_bin));
    }

    #[tokio::test]
    async fn with_no_selection_the_answer_is_what_it_was() {
        let home = FakeHome::new("engine-tool-settings-none-");
        let ctx = ctx(&home);
        let deps = CtxToolSettingsDeps::new(&ctx);
        assert!(!deps.has_live_selection("gog:1"));
        let stored = json!({"winePrefix": "/old"});
        // A selection that was cleared at the end of the launch no longer overlays.
        let selection = fallback_selection(&home, "Fallback Wine");
        assert!(ctx
            .registry
            .set_engine_selection_quiet(None, "gog:1", selection));
        ctx.registry.clear_engine_selection("gog:1");
        assert!(!deps.has_live_selection("gog:1"));
        assert_eq!(deps.overlay("gog:1", &stored), stored);
        // Without a selection the stored override decides, as before: a read of a game whose bottle
        // is not created yet is unavailable, never a created bottle.
        assert_eq!(
            resolve_tool_settings_for_id(&ctx, &deps, &gog(), &stored, false).await,
            ToolSettingsResult::Unavailable {
                reason: Unavailable::BottleNotCreated
            }
        );
    }

    #[tokio::test]
    async fn ensure_bottle_goes_through_the_per_game_flight() {
        let home = FakeHome::new("engine-tool-settings-ensure-");
        let ctx = ctx(&home);
        let deps = CtxToolSettingsDeps::new(&ctx);
        let request = |bottle_name: &str| EnsureBottleRequest {
            key: "gog:1".to_string(),
            bottle_name: bottle_name.to_string(),
            app_name: "1".to_string(),
            runner: "gog".to_string(),
        };
        // A bottle that already exists is the flight's idempotent answer: nothing is created.
        let existing = bottle_dir(&ctx, "GameLib-gog-1");
        std::fs::create_dir_all(&existing).unwrap();
        std::fs::write(Path::new(&existing).join("cxbottle.conf"), b"").unwrap();
        assert!(deps.ensure_game_bottle(request("GameLib-gog-1")).await);
        // A name the sanitiser would change is refused before any flight starts: the tool is unavailable.
        assert!(!deps.ensure_game_bottle(request("../escape")).await);
        assert!(!is_bottle_provisioned(&ctx, "../escape"));
    }
}
