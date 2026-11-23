//! The per-launch settings overlay (Phase 61, 59 D-07, D-08; ported from `launchSettings.ts`).
//!
//! The engine chosen for a launch lives in the context's registry. This module turns that choice into
//! a `GameSettings` for one launch: the store launch asks [`LaunchSettingsRegistry::get_launch_settings`]
//! instead of using the stored settings directly. Nothing is ever written to the game's config and the
//! input is never mutated, so falling back stays session state. The overlay contexts are in memory only:
//! empty at construction, no timer, no I/O.

use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard};

use serde_json::{json, Value};

use crate::bottles::registry::EngineSelection;
use crate::ctx::EngineCtx;
pub use crate::tool_settings::{
    build_crossover_game_settings, build_fallback_game_settings, build_plain_prefix_settings,
};

/// The prefix kind of an overlay context.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OverlayPrefix {
    Bottle { bottle_name: String },
    Plain,
}

/// What the overlay needs to know about a launch beyond its selection (`LaunchOverlayContext`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OverlayContext {
    pub prefix: OverlayPrefix,
    /// The CrossOver bin dir, for a CrossOver selection on a bottle. `None` is "use the selection's".
    pub bin_dir: Option<String>,
}

impl OverlayContext {
    pub fn bottle(bottle_name: &str, bin_dir: Option<String>) -> OverlayContext {
        OverlayContext {
            prefix: OverlayPrefix::Bottle {
                bottle_name: bottle_name.to_string(),
            },
            bin_dir,
        }
    }

    pub fn plain() -> OverlayContext {
        OverlayContext {
            prefix: OverlayPrefix::Plain,
            bin_dir: None,
        }
    }

    /// The TS object (`{prefix: {kind, bottleName?}, binDir?}`); an absent `binDir` is left out.
    pub fn to_value(&self) -> Value {
        let prefix = match &self.prefix {
            OverlayPrefix::Bottle { bottle_name } => {
                json!({"kind": "bottle", "bottleName": bottle_name})
            }
            OverlayPrefix::Plain => json!({"kind": "plain"}),
        };
        let mut out = json!({ "prefix": prefix });
        if let Some(bin_dir) = &self.bin_dir {
            out["binDir"] = json!(bin_dir);
        }
        out
    }
}

/// The overlay contexts of the running launches, by engine key. In memory only.
#[derive(Debug, Default)]
pub struct LaunchSettingsRegistry {
    contexts: Mutex<HashMap<String, OverlayContext>>,
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|e| e.into_inner())
}

impl LaunchSettingsRegistry {
    pub fn new() -> LaunchSettingsRegistry {
        LaunchSettingsRegistry::default()
    }

    pub fn set_launch_overlay_context(&self, key: &str, context: OverlayContext) {
        lock(&self.contexts).insert(key.to_string(), context);
    }

    pub fn get_launch_overlay_context(&self, key: &str) -> Option<OverlayContext> {
        lock(&self.contexts).get(key).cloned()
    }

    pub fn clear_launch_overlay_context(&self, key: &str) {
        lock(&self.contexts).remove(key);
    }

    /// The number of launches holding a context.
    pub fn len(&self) -> usize {
        lock(&self.contexts).len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// `getLaunchSettings`: the settings one launch runs with. `None` and a key with no selection or no
    /// context answer the stored settings unchanged; a CrossOver selection on a plain prefix does too.
    pub fn get_launch_settings(&self, ctx: &EngineCtx, key: Option<&str>, stored: &Value) -> Value {
        let Some(key) = key else {
            return stored.clone();
        };
        let (Some(selection), Some(context)) = (
            ctx.registry.get_engine_selection(key),
            self.get_launch_overlay_context(key),
        ) else {
            return stored.clone();
        };
        match (&selection, &context.prefix) {
            (
                EngineSelection::Crossover {
                    crossover_build,
                    bin_dir,
                    ..
                },
                OverlayPrefix::Bottle { bottle_name },
            ) => build_crossover_game_settings(
                stored,
                bottle_name,
                context.bin_dir.as_deref().unwrap_or(bin_dir),
                crossover_build.as_deref(),
            ),
            (EngineSelection::Crossover { .. }, OverlayPrefix::Plain) => stored.clone(),
            (_, OverlayPrefix::Bottle { bottle_name }) => match selection.engine() {
                Some(engine) => {
                    // `{...stored, ...buildFallbackGameSettings(...)}`: the fallback settings already
                    // carry the stored ones, so the spread is the fallback's own result.
                    build_fallback_game_settings(ctx, bottle_name, engine, stored)
                }
                None => stored.clone(),
            },
            (_, OverlayPrefix::Plain) => match selection.engine() {
                Some(engine) => build_plain_prefix_settings(stored, engine),
                None => stored.clone(),
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ctx::{EnginePaths, Platform};
    use gamelib_core::clock::SystemClock;
    use gamelib_core::shutdown::Shutdown;
    use gamelib_store::host::StoreHost;
    use gamelib_testutil::FakeHome;
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

    #[test]
    fn contexts_are_set_read_and_cleared_by_key() {
        let registry = LaunchSettingsRegistry::new();
        assert!(registry.is_empty());
        registry.set_launch_overlay_context("gog:1", OverlayContext::bottle("GameLib-gog-1", None));
        registry.set_launch_overlay_context("gog:2", OverlayContext::plain());
        assert_eq!(registry.len(), 2);
        assert_eq!(
            registry
                .get_launch_overlay_context("gog:1")
                .unwrap()
                .to_value(),
            json!({"prefix": {"kind": "bottle", "bottleName": "GameLib-gog-1"}})
        );
        registry.clear_launch_overlay_context("gog:1");
        assert!(registry.get_launch_overlay_context("gog:1").is_none());
        assert_eq!(registry.len(), 1);
    }

    #[test]
    fn a_key_without_a_selection_or_a_context_keeps_the_stored_settings() {
        let home = FakeHome::new("engine-launch-settings-");
        let ctx = ctx(&home);
        let stored = json!({"winePrefix": "/old"});
        assert_eq!(
            ctx.launch_settings.get_launch_settings(&ctx, None, &stored),
            stored
        );
        // A context with no selection, then a selection with no context: both leave it as it was.
        ctx.launch_settings
            .set_launch_overlay_context("gog:1", OverlayContext::bottle("GameLib-gog-1", None));
        assert_eq!(
            ctx.launch_settings
                .get_launch_settings(&ctx, Some("gog:1"), &stored),
            stored
        );
    }

    #[test]
    fn a_crossover_selection_takes_the_contexts_bin_dir_over_its_own() {
        let home = FakeHome::new("engine-launch-settings-");
        let ctx = ctx(&home);
        let selection = EngineSelection::Crossover {
            reason: "cx-healthy".to_string(),
            crossover_build: Some("26.3.0.39832".to_string()),
            bin_dir: "/cx/bin".to_string(),
        };
        assert!(ctx
            .registry
            .set_engine_selection_quiet(None, "gog:1", selection));
        let stored = json!({"winePrefix": "/old"});
        ctx.launch_settings.set_launch_overlay_context(
            "gog:1",
            OverlayContext::bottle("GameLib-gog-1", Some("/other/bin".to_string())),
        );
        let out = ctx
            .launch_settings
            .get_launch_settings(&ctx, Some("gog:1"), &stored);
        assert_eq!(out["wineVersion"]["bin"], "/other/bin/wine");
        assert_eq!(out["wineVersion"]["name"], "CrossOver 26.3.0.39832");
        assert_eq!(out["wineCrossoverBottle"], "GameLib-gog-1");
        assert_eq!(
            stored,
            json!({"winePrefix": "/old"}),
            "the input is never changed"
        );
        // A CrossOver selection on a plain prefix leaves the settings alone.
        ctx.launch_settings
            .set_launch_overlay_context("gog:1", OverlayContext::plain());
        assert_eq!(
            ctx.launch_settings
                .get_launch_settings(&ctx, Some("gog:1"), &stored),
            stored
        );
    }
}
