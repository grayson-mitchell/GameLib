//! The shell's [`HumbleSecretSource`] for the two Humble secrets (Phase 94, D-18): the session cookie and
//! the CSRF token.
//!
//! The secrets stay in the keyring slots `humble-session` and `humble-csrf` under the unchanged
//! `KEYRING_SERVICE`. [`KeyringHumbleSecretSource`] makes exactly the `Entry` calls `keyring_dispatch`
//! and `info_secrets.rs` make (the shared `keyring_*_account` core there, one bounded read through
//! `KEYRING_READ_TIMEOUT`), resolves every account through `keyring_account`'s allowlist (so a renamed slot
//! fails a test here and no slot name is typed in the crate), and logs only the channel label, the account
//! and the outcome. The signed binary's Keychain ACL therefore sees the same items as before and no new
//! prompt appears (FND-07). A value never reaches a log line or an error: the errors it answers are the
//! fixed categories `timeout` and `unavailable` (T-94-38).
//!
//! `gamelib-humble` has no `keyring` dependency: this file is where the Keychain meets the crate.
//!
//! D-18 and 86 D-26: [`DevVaultHumbleSecretSource`] is the Rust port of the Humble half of the TS dev vault
//! (`devSecretVault.ts`). It exists so `pnpm tauri:dev` keeps its no-Keychain-prompt property, and it is
//! used only when `GAMELIB_DEV_SECRET_VAULT` is exactly `1` AND `tauri::is_dev()` is true: a packaged build
//! can never reach it. It shares `<temp>/gamelib-dev-secret-vault.json` with the sidecar's vault and the
//! info source (the O_NOFOLLOW read, the exclusive-create-then-rename write and the one in-process
//! read-modify-write mutex all live in `info_secrets.rs`), under the keys the TS vault uses
//! (`sessionCookie`, `csrfToken`).
//!
//! The one-time plaintext-to-Keychain migration ([`start_humble_migration`]) is bounded boot work holding
//! a `humble-migration` shutdown registrant. A dev-vault run never migrates: the TS boot took the vault
//! arm exclusively so that a developer's boot never touches the Keychain, and that stays so here.

use super::*;

use std::path::Path;

use gamelib_humble::secrets::{HumbleSecretSource, HumbleSlot};

use crate::info_secrets::{
    keyring_delete_account, keyring_read_account, keyring_write_account, open_vault,
    DevVaultSecretSource, SourceKind, DEV_SECRET_VAULT_ENV,
};

/// The renderer-facing slot name each crate slot lives under in the keyring allowlist.
fn slot_name(slot: HumbleSlot) -> &'static str {
    match slot {
        HumbleSlot::Session => "humble-session",
        HumbleSlot::Csrf => "humble-csrf",
    }
}

/// The Keychain account of `slot`, resolved through `keyring_account`'s allowlist: this file names no
/// account of its own, so a slot the allowlist drops answers `keyring:unknown-slot` instead of reaching
/// an arbitrary Keychain entry.
pub(crate) fn slot_account(slot: HumbleSlot) -> Result<&'static str, String> {
    keyring_account(slot_name(slot))
}

/// The label a log line carries for each operation (`keyring {channel} account=... outcome=...`).
const CHANNEL_GET: &str = "humble_secret_get";
const CHANNEL_SET: &str = "humble_secret_set";
const CHANNEL_DELETE: &str = "humble_secret_delete";
const CHANNEL_AVAILABLE: &str = "humble_secret_available";

/// The Keychain-backed source: the production [`HumbleSecretSource`] unless the dev vault is in use.
pub(crate) struct KeyringHumbleSecretSource;

impl HumbleSecretSource for KeyringHumbleSecretSource {
    fn get(&self, slot: HumbleSlot) -> Result<Option<String>, String> {
        keyring_read_account(CHANNEL_GET, slot_account(slot)?)
    }

    fn set(&self, slot: HumbleSlot, value: &str) -> Result<(), String> {
        keyring_write_account(CHANNEL_SET, slot_account(slot)?, value)
    }

    fn delete(&self, slot: HumbleSlot) -> Result<(), String> {
        keyring_delete_account(CHANNEL_DELETE, slot_account(slot)?)
    }

    /// The same non-prompting probe `keyring_available` runs (a never-written reserved account): it is
    /// slot-independent, so the session slot stands in for the store, as it does in the TS.
    fn available(&self) -> Result<bool, String> {
        let slot = Value::String(slot_name(HumbleSlot::Session).to_string());
        match rpc_keyring_available(CHANNEL_AVAILABLE, &[slot]) {
            Ok(Value::Bool(reachable)) => Ok(reachable),
            _ => Err("unavailable".to_string()),
        }
    }
}

/// The key each slot has in the vault file (the TS `VaultSlot` names, `HumbleSecretKey` verbatim).
fn vault_key(slot: HumbleSlot) -> &'static str {
    slot.config_key()
}

/// The plaintext dev vault for the two Humble slots.
pub(crate) struct DevVaultHumbleSecretSource {
    vault: DevVaultSecretSource,
}

impl HumbleSecretSource for DevVaultHumbleSecretSource {
    fn get(&self, slot: HumbleSlot) -> Result<Option<String>, String> {
        Ok(self.vault.read_key(vault_key(slot)))
    }

    fn set(&self, slot: HumbleSlot, value: &str) -> Result<(), String> {
        self.vault.write_key(vault_key(slot), value, false)
    }

    /// A wipe stores the empty string, as the TS vault does: it reads back as "never stored".
    fn delete(&self, slot: HumbleSlot) -> Result<(), String> {
        self.vault.write_key(vault_key(slot), "", true)
    }

    /// The TS dev vault's `isAvailable` is a plain `true`.
    fn available(&self) -> Result<bool, String> {
        Ok(true)
    }
}

/// The source for these inputs: the vault when `GAMELIB_DEV_SECRET_VAULT` is exactly `1` in a dev build
/// and the file can be made owner-only, the keyring otherwise.
fn choose_source(
    env: Option<&str>,
    is_dev: bool,
    temp: &Path,
) -> (Arc<dyn HumbleSecretSource>, SourceKind) {
    match open_vault(env, is_dev, temp, "humble") {
        Some(vault) => (
            Arc::new(DevVaultHumbleSecretSource { vault }),
            SourceKind::DevVault,
        ),
        None => (Arc::new(KeyringHumbleSecretSource), SourceKind::Keyring),
    }
}

/// The source `humble_dispatch::install` hands the context. Reads the variable once, here.
pub(crate) fn secret_source() -> Arc<dyn HumbleSecretSource> {
    let env = std::env::var(DEV_SECRET_VAULT_ENV).ok();
    let (source, kind) = choose_source(env.as_deref(), tauri::is_dev(), &std::env::temp_dir());
    shell_log(&format!("humble secret source: {}", kind.word()));
    source
}

#[cfg(test)]
mod tests {
    use super::*;

    // Nothing here builds a keyring `Entry`: the Keychain is the operator's real one. The impls above and
    // the shared core in `info_secrets.rs` are the only places that call `Entry::new`.

    #[test]
    fn slot_account_is_the_keyring_dispatch_account_of_each_slot() {
        assert_eq!(
            slot_account(HumbleSlot::Session),
            keyring_account("humble-session")
        );
        assert_eq!(
            slot_account(HumbleSlot::Csrf),
            keyring_account("humble-csrf")
        );
        // Pinned as literals too: a rename is a silent sign-out plus a fresh Keychain prompt.
        assert_eq!(slot_account(HumbleSlot::Session), Ok("humble-session"));
        assert_eq!(slot_account(HumbleSlot::Csrf), Ok("humble-csrf"));
    }

    #[test]
    fn the_two_slots_have_distinct_accounts_and_never_name_another_slot() {
        let session = slot_account(HumbleSlot::Session).unwrap();
        let csrf = slot_account(HumbleSlot::Csrf).unwrap();
        assert_ne!(session, csrf);
        for other in ["steam-refresh-token", "itad-api-key", "steamgrid-api-key"] {
            assert_ne!(session, keyring_account(other).unwrap());
            assert_ne!(csrf, keyring_account(other).unwrap());
        }
    }

    #[test]
    fn the_vault_keys_are_the_ts_vault_keys() {
        assert_eq!(vault_key(HumbleSlot::Session), "sessionCookie");
        assert_eq!(vault_key(HumbleSlot::Csrf), "csrfToken");
    }

    fn vault_source(home: &gamelib_testutil::FakeHome) -> Arc<dyn HumbleSecretSource> {
        let (source, kind) = choose_source(Some("1"), true, home.root());
        assert_eq!(kind, SourceKind::DevVault);
        source
    }

    #[test]
    fn choose_source_picks_the_vault_only_for_one_in_a_dev_build() {
        let home = gamelib_testutil::FakeHome::new("humble-vault-");
        let file = home.root().join("gamelib-dev-secret-vault.json");
        for (env, is_dev) in [
            (Some("1"), false),
            (Some("true"), true),
            (Some("0"), true),
            (None, true),
            (None, false),
        ] {
            let (_, kind) = choose_source(env, is_dev, home.root());
            assert_eq!(kind, SourceKind::Keyring, "{env:?} dev={is_dev}");
            assert!(!file.exists(), "a refused vault leaves no file");
        }
        let (_, kind) = choose_source(Some("1"), true, &home.root().join("missing"));
        assert_eq!(
            kind,
            SourceKind::Keyring,
            "a vault that cannot be made falls back"
        );
    }

    #[test]
    fn a_vault_round_trips_both_slots_and_a_wipe_reads_as_empty() {
        let home = gamelib_testutil::FakeHome::new("humble-vault-");
        let source = vault_source(&home);
        assert_eq!(source.get(HumbleSlot::Session).unwrap(), None);
        assert_eq!(source.available(), Ok(true));
        source.set(HumbleSlot::Session, "fake-session-1").unwrap();
        source.set(HumbleSlot::Csrf, "fake-csrf-1").unwrap();
        assert_eq!(
            source.get(HumbleSlot::Session).unwrap().as_deref(),
            Some("fake-session-1")
        );
        source.delete(HumbleSlot::Session).unwrap();
        assert_eq!(source.get(HumbleSlot::Session).unwrap(), None);
        assert_eq!(
            source.get(HumbleSlot::Csrf).unwrap().as_deref(),
            Some("fake-csrf-1"),
            "the other slot is untouched"
        );
        let text =
            std::fs::read_to_string(home.root().join("gamelib-dev-secret-vault.json")).unwrap();
        let file: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(
            file["sessionCookie"], "",
            "the wipe left the empty string, as TS does"
        );
        assert_eq!(file["csrfToken"], "fake-csrf-1");
    }

    /// The vault is one file for Steam, the info keys and Humble: a Humble write keeps all of them.
    #[test]
    fn a_humble_write_keeps_every_other_slot_in_the_vault() {
        let home = gamelib_testutil::FakeHome::new("humble-vault-");
        let path = home.root().join("gamelib-dev-secret-vault.json");
        std::fs::write(
            &path,
            r#"{"steam-refresh-token":"steam-1","itadApiKey":"itad-1","steamGridDbApiKey":"sgdb-1"}"#,
        )
        .unwrap();
        let source = vault_source(&home);
        source.set(HumbleSlot::Session, "fake-session-1").unwrap();
        source.set(HumbleSlot::Csrf, "fake-csrf-1").unwrap();
        let file: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(file["steam-refresh-token"], "steam-1");
        assert_eq!(file["itadApiKey"], "itad-1");
        assert_eq!(file["steamGridDbApiKey"], "sgdb-1");
        assert_eq!(file["sessionCookie"], "fake-session-1");
    }

    /// WR-21: a vault that does not parse reads as empty, but a write refuses instead of rebuilding the
    /// file from one slot, which would erase the Steam slot the sidecar keeps in it.
    #[test]
    fn a_corrupt_vault_reads_as_empty_and_a_write_refuses_and_leaves_the_file_alone() {
        let home = gamelib_testutil::FakeHome::new("humble-vault-");
        let path = home.root().join("gamelib-dev-secret-vault.json");
        std::fs::write(&path, "not json {").unwrap();
        let source = vault_source(&home);
        assert_eq!(source.get(HumbleSlot::Session).unwrap(), None);
        assert_eq!(
            source.set(HumbleSlot::Session, "fake-session-1"),
            Err("corrupt".to_string())
        );
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "not json {");
    }

    /// WR-21: a link planted at the vault path after the source was made is never read or written
    /// through.
    #[cfg(unix)]
    #[test]
    fn a_link_planted_after_create_is_not_followed_by_a_read_or_a_write() {
        let home = gamelib_testutil::FakeHome::new("humble-vault-");
        let path = home.root().join("gamelib-dev-secret-vault.json");
        let source = vault_source(&home);
        source.set(HumbleSlot::Session, "fake-session-1").unwrap();
        let target = home.root().join("elsewhere.json");
        std::fs::write(&target, r#"{"sessionCookie":"planted"}"#).unwrap();
        std::fs::remove_file(&path).unwrap();
        std::os::unix::fs::symlink(&target, &path).unwrap();
        assert_eq!(
            source.get(HumbleSlot::Session).unwrap(),
            None,
            "the link is not read"
        );
        assert!(source.set(HumbleSlot::Csrf, "fake-csrf-1").is_err());
        assert_eq!(
            std::fs::read_to_string(&target).unwrap(),
            r#"{"sessionCookie":"planted"}"#,
            "the link target is not written"
        );
    }

    /// The Humble migration and the info migration may race on the one vault file in a dev run; neither
    /// ever loses the other's key (the mutex is shared across the sources).
    #[test]
    fn concurrent_writes_through_the_two_sources_keep_every_key() {
        let home = gamelib_testutil::FakeHome::new("humble-vault-");
        let humble = vault_source(&home);
        let (info, _) = crate::info_secrets::choose_source(Some("1"), true, home.root());
        let writers: Vec<_> = (0..8)
            .map(|n| {
                let humble = Arc::clone(&humble);
                let info = Arc::clone(&info);
                std::thread::spawn(move || {
                    humble
                        .set(HumbleSlot::Session, &format!("fake-session-{n}"))
                        .unwrap();
                    info.set(gamelib_info::secrets::Slot::Itad, &format!("itad-{n}"))
                        .unwrap();
                })
            })
            .collect();
        for writer in writers {
            writer.join().unwrap();
        }
        assert!(humble.get(HumbleSlot::Session).unwrap().is_some());
        assert!(info
            .get(gamelib_info::secrets::Slot::Itad)
            .unwrap()
            .is_some());
    }
}
