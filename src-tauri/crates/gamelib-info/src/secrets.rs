//! The seam for the two API keys (D-19). The shell implements [`SecretSource`] over the Keychain
//! (86-14); this crate has no `keyring` dependency, and `gamelib-info-cli` reads the keys from its
//! own environment only, never the Keychain.
//!
//! Errors are fixed categories, never a value: a key must not reach a log or an error string.

#[cfg(feature = "testing")]
use std::collections::HashMap;
#[cfg(feature = "testing")]
use std::sync::Mutex;

/// A key's slot. The names the shell stores them under (`steamgrid-api-key`, `itad-api-key`) belong
/// to the shell.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Slot {
    SteamGridDb,
    Itad,
}

/// Where the keys live.
pub trait SecretSource: Send + Sync {
    /// The stored key, or `None` when the slot is empty.
    fn get(&self, slot: Slot) -> Result<Option<String>, String>;
    fn set(&self, slot: Slot, value: &str) -> Result<(), String>;
    fn delete(&self, slot: Slot) -> Result<(), String>;
}

/// Reads the keys from two environment variables whose names the caller gives (the CLI passes
/// `GAMELIB_INFO_ITAD_KEY` and `GAMELIB_INFO_SGDB_KEY`). Read-only: it never sets a variable, so
/// `set` and `delete` answer `read-only`. The library itself reads no environment variable; only a
/// binary that builds this source does.
pub struct EnvSecretSource {
    itad_var: String,
    steamgrid_var: String,
}

impl EnvSecretSource {
    pub fn new(itad_var: &str, steamgrid_var: &str) -> EnvSecretSource {
        EnvSecretSource {
            itad_var: itad_var.to_string(),
            steamgrid_var: steamgrid_var.to_string(),
        }
    }

    fn var(&self, slot: Slot) -> &str {
        match slot {
            Slot::Itad => &self.itad_var,
            Slot::SteamGridDb => &self.steamgrid_var,
        }
    }
}

impl SecretSource for EnvSecretSource {
    fn get(&self, slot: Slot) -> Result<Option<String>, String> {
        match std::env::var(self.var(slot)) {
            Ok(v) if !v.trim().is_empty() => Ok(Some(v.trim().to_string())),
            Ok(_) | Err(std::env::VarError::NotPresent) => Ok(None),
            Err(std::env::VarError::NotUnicode(_)) => Err("not-unicode".to_string()),
        }
    }

    fn set(&self, _slot: Slot, _value: &str) -> Result<(), String> {
        Err("read-only".to_string())
    }

    fn delete(&self, _slot: Slot) -> Result<(), String> {
        Err("read-only".to_string())
    }
}

/// An in-memory source for tests. Its `Debug` names the occupied slots and never a value.
#[cfg(feature = "testing")]
#[derive(Default)]
pub struct MemorySecretSource {
    slots: Mutex<HashMap<Slot, String>>,
}

#[cfg(feature = "testing")]
impl MemorySecretSource {
    pub fn new() -> MemorySecretSource {
        MemorySecretSource::default()
    }

    /// A source already holding `value` in `slot`.
    pub fn with(slot: Slot, value: &str) -> MemorySecretSource {
        let source = MemorySecretSource::new();
        source.lock().insert(slot, value.to_string());
        source
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<Slot, String>> {
        self.slots.lock().unwrap_or_else(|e| e.into_inner())
    }
}

#[cfg(feature = "testing")]
impl std::fmt::Debug for MemorySecretSource {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let mut held: Vec<Slot> = self.lock().keys().copied().collect();
        held.sort_by_key(|s| *s as u8);
        f.debug_struct("MemorySecretSource")
            .field("slots", &held)
            .finish()
    }
}

#[cfg(feature = "testing")]
impl SecretSource for MemorySecretSource {
    fn get(&self, slot: Slot) -> Result<Option<String>, String> {
        Ok(self.lock().get(&slot).cloned())
    }

    /// Trims, and an empty value clears the slot, as the keyring owners do.
    fn set(&self, slot: Slot, value: &str) -> Result<(), String> {
        let value = value.trim();
        let mut slots = self.lock();
        if value.is_empty() {
            slots.remove(&slot);
        } else {
            slots.insert(slot, value.to_string());
        }
        Ok(())
    }

    fn delete(&self, slot: Slot) -> Result<(), String> {
        self.lock().remove(&slot);
        Ok(())
    }
}
