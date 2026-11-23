//! The tools' in-memory state (82 row `tools-state`, owner `gamelib-wine` per the 87-01 amendment): a
//! port of `toolsState.ts`. The single-flight "installing" slot, the winetricks catalog cache (the
//! last non-empty list per game) and the cached script metadata live here, in memory only: nothing
//! in it is persisted, so a restart starts empty, as the TS boot-owned state did.
//!
//! One [`ToolsState`] belongs to one [`crate::ctx::WineCtx`], so every op of a boot shares one slot
//! and one set of caches. No I/O, timer or handle. The DXVK family reads none of it (it has no slot);
//! it is here because the same boot-owned object carries the winetricks half, which 87-28 and later
//! use, and the plan assigns the whole object to this slice.

use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard};

use serde_json::Value;

use crate::winetricks::env::WinetricksEnvironment;
use crate::winetricks::metadata::ScriptMetadata;

/// The state of the tools of one boot.
#[derive(Default)]
pub struct ToolsState {
    installing: Mutex<String>,
    catalog: Mutex<HashMap<String, Vec<Value>>>,
    script_metadata: Mutex<Option<(String, Arc<ScriptMetadata>)>>,
    /// The winetricks environment reports and their one change listener (87-32).
    pub winetricks_env: WinetricksEnvironment,
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    // A panic while a guard was held leaves the data as it was; the state is plain values.
    mutex.lock().unwrap_or_else(|e| e.into_inner())
}

/// The slot an install holds while it runs. Dropping it frees the slot, so an install that ends in
/// an error or a panic cannot leave the next one refused for the rest of the boot.
#[must_use = "the slot is held only while this value lives"]
pub struct InstallSlot<'a> {
    state: &'a ToolsState,
}

impl Drop for InstallSlot<'_> {
    fn drop(&mut self) {
        lock(&self.state.installing).clear();
    }
}

impl ToolsState {
    pub fn new() -> ToolsState {
        ToolsState::default()
    }

    /// The component being installed, or `""` (the TS `installing.get()`).
    pub fn installing(&self) -> String {
        lock(&self.installing).clone()
    }

    /// Takes the single-flight slot for `component`. `Err` names the component that holds it: the
    /// TS refused a second install while `installing` was non-empty.
    pub fn begin_install(&self, component: &str) -> Result<InstallSlot<'_>, String> {
        let mut slot = lock(&self.installing);
        if !slot.is_empty() {
            return Err(slot.clone());
        }
        *slot = component.to_string();
        drop(slot);
        Ok(InstallSlot { state: self })
    }

    /// The cached catalog of `key` (`<runner>:<appName>`), if any.
    pub fn catalog(&self, key: &str) -> Option<Vec<Value>> {
        lock(&self.catalog).get(key).cloned()
    }

    /// Caches `components` under `key`. An empty list is not cached, as the TS cached only a
    /// non-empty visible list.
    pub fn set_catalog(&self, key: &str, components: Vec<Value>) {
        if !components.is_empty() {
            lock(&self.catalog).insert(key.to_string(), components);
        }
    }

    /// The parsed script metadata and the `mtimeMs:size` key it was derived under.
    pub fn script_metadata(&self) -> Option<(String, Arc<ScriptMetadata>)> {
        lock(&self.script_metadata).clone()
    }

    pub fn set_script_metadata(&self, entry: Option<(String, Arc<ScriptMetadata>)>) {
        *lock(&self.script_metadata) = entry;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn the_install_slot_is_single_flight_and_frees_on_drop() {
        let state = ToolsState::new();
        assert_eq!(state.installing(), "");
        let slot = state.begin_install("winetricks:vcrun2019").unwrap();
        assert_eq!(state.installing(), "winetricks:vcrun2019");
        assert_eq!(
            state.begin_install("other").err().as_deref(),
            Some("winetricks:vcrun2019")
        );
        drop(slot);
        assert_eq!(state.installing(), "");
        assert!(state.begin_install("other").is_ok());
    }

    #[test]
    fn a_panic_while_the_slot_is_held_does_not_wedge_it() {
        let state = std::sync::Arc::new(ToolsState::new());
        let inner = std::sync::Arc::clone(&state);
        let crashed = std::thread::spawn(move || {
            let _slot = inner.begin_install("x").unwrap();
            panic!("install crashed");
        })
        .join();
        assert!(crashed.is_err());
        assert_eq!(state.installing(), "");
        assert!(state.begin_install("y").is_ok());
    }

    #[test]
    fn only_a_non_empty_catalog_is_cached() {
        let state = ToolsState::new();
        state.set_catalog("gog:1", Vec::new());
        assert_eq!(state.catalog("gog:1"), None);
        state.set_catalog("gog:1", vec![json!({"verb": "corefonts"})]);
        assert_eq!(
            state.catalog("gog:1"),
            Some(vec![json!({"verb": "corefonts"})])
        );
        // An empty list does not replace the last good one.
        state.set_catalog("gog:1", Vec::new());
        assert_eq!(state.catalog("gog:1").map(|c| c.len()), Some(1));
    }

    #[test]
    fn script_metadata_is_kept_under_its_key_until_cleared() {
        let state = ToolsState::new();
        assert!(state.script_metadata().is_none());
        state.set_script_metadata(Some((
            "1:2".to_string(),
            Arc::new(ScriptMetadata::default()),
        )));
        assert_eq!(
            state.script_metadata().map(|(k, _)| k).as_deref(),
            Some("1:2")
        );
        state.set_script_metadata(None);
        assert!(state.script_metadata().is_none());
    }
}
