//! The shell's [`SecretSource`] for the two API keys the information services use (Phase 86, 86-14,
//! D-19 and D-26): ITAD and SteamGridDB.
//!
//! The keys stay in the keyring slots `itad-api-key` and `steamgrid-api-key` under the unchanged
//! `KEYRING_SERVICE`. [`KeyringSecretSource`] makes exactly the `Entry` calls `keyring_dispatch`
//! makes for those slots, reads through the same bounded read (`KEYRING_READ_TIMEOUT`), adds no slot
//! name (the account comes from `keyring_account`, so a renamed slot fails a test here) and logs only
//! the channel label, the account and the outcome. A value never reaches a log line or an error: the
//! errors it answers are the fixed categories `timeout` and `unavailable` (T-86-27).
//!
//! `gamelib-info` and `gamelib-info-cli` have no `keyring` dependency (D-19): this file is where the
//! Keychain meets the crate.
//!
//! D-26: [`DevVaultSecretSource`] is the Rust port of the TS dev vault (`devSecretVault.ts`) for the
//! two slots this file owns. It exists so `pnpm tauri:dev` keeps its no-Keychain-prompt property, and
//! it is used only when `GAMELIB_DEV_SECRET_VAULT` is exactly `1` AND `tauri::is_dev()` is true
//! ([`use_dev_vault`]): a packaged build can never reach it (T-86-28). It shares
//! `<temp>/gamelib-dev-secret-vault.json` with the sidecar's vault and keeps every other slot in it.

use super::*;

use std::path::{Path, PathBuf};

use gamelib_info::secrets::{SecretSource, Slot};

/// The renderer-facing slot name each crate slot lives under in the keyring allowlist.
fn slot_name(slot: Slot) -> &'static str {
    match slot {
        Slot::Itad => "itad-api-key",
        Slot::SteamGridDb => "steamgrid-api-key",
    }
}

/// The Keychain account of `slot`, resolved through `keyring_account`'s allowlist (T-86-29): this
/// file names no account of its own, so a slot the allowlist drops answers `keyring:unknown-slot`
/// instead of reaching an arbitrary Keychain entry.
pub(crate) fn slot_account(slot: Slot) -> Result<&'static str, String> {
    keyring_account(slot_name(slot))
}

/// The label a log line carries for each operation (`keyring {channel} account=... outcome=...`).
const CHANNEL_GET: &str = "info_secret_get";
const CHANNEL_SET: &str = "info_secret_set";
const CHANNEL_DELETE: &str = "info_secret_delete";

/// The fixed category a failed keyring answer is reported under. The text of the underlying error
/// can carry an OS message, so only the category crosses into the crate.
fn failure_category(error: &str) -> &'static str {
    if error == "keyring:timeout" {
        "timeout"
    } else {
        "unavailable"
    }
}

/// The Keychain-backed source: the production [`SecretSource`] unless the dev vault is in use.
pub(crate) struct KeyringSecretSource;

impl SecretSource for KeyringSecretSource {
    fn get(&self, slot: Slot) -> Result<Option<String>, String> {
        let account = slot_account(slot)?;
        let result = bounded_keyring_read(KEYRING_READ_TIMEOUT, move || {
            keyring_get_result(
                Entry::new(KEYRING_SERVICE, account).and_then(|entry| entry.get_password()),
            )
        });
        match result {
            Ok(Value::String(secret)) => {
                shell_log(&keyring_outcome_message(
                    CHANNEL_GET,
                    account,
                    KeyringOutcome::Found,
                ));
                Ok(Some(secret))
            }
            Ok(_) => {
                shell_log(&keyring_outcome_message(
                    CHANNEL_GET,
                    account,
                    KeyringOutcome::Absent,
                ));
                Ok(None)
            }
            Err(e) => {
                let kind = keyring_error_class(&e);
                shell_log_detail(
                    &format!("keyring {CHANNEL_GET} account={account} failed ({kind})"),
                    &e,
                );
                Err(failure_category(&e).to_string())
            }
        }
    }

    fn set(&self, slot: Slot, value: &str) -> Result<(), String> {
        let account = slot_account(slot)?;
        match Entry::new(KEYRING_SERVICE, account).and_then(|entry| entry.set_password(value)) {
            Ok(()) => {
                shell_log(&keyring_outcome_message(
                    CHANNEL_SET,
                    account,
                    KeyringOutcome::Stored,
                ));
                Ok(())
            }
            Err(e) => {
                // The category is the variant's name; the error's own text stays on stderr.
                shell_log_detail(
                    &format!(
                        "keyring {CHANNEL_SET} account={account} failed ({})",
                        keyring_error_kind(&e)
                    ),
                    &format!("{e:?}"),
                );
                Err("unavailable".to_string())
            }
        }
    }

    fn delete(&self, slot: Slot) -> Result<(), String> {
        let account = slot_account(slot)?;
        match Entry::new(KEYRING_SERVICE, account).and_then(|entry| entry.delete_credential()) {
            Ok(()) => {
                shell_log(&keyring_outcome_message(
                    CHANNEL_DELETE,
                    account,
                    KeyringOutcome::Deleted,
                ));
                Ok(())
            }
            // Deleting an empty slot is success, as in `rpc_keyring_delete`.
            Err(keyring::Error::NoEntry) => {
                shell_log(&keyring_outcome_message(
                    CHANNEL_DELETE,
                    account,
                    KeyringOutcome::Absent,
                ));
                Ok(())
            }
            Err(e) => {
                shell_log_detail(
                    &format!(
                        "keyring {CHANNEL_DELETE} account={account} failed ({})",
                        keyring_error_kind(&e)
                    ),
                    &format!("{e:?}"),
                );
                Err("unavailable".to_string())
            }
        }
    }
}

// ---- The dev vault (D-26) ----

/// The exact-match environment variable that opts a dev run into the vault.
const DEV_SECRET_VAULT_ENV: &str = "GAMELIB_DEV_SECRET_VAULT";

/// The vault file name, shared with `devSecretVault.ts`; it sits under the temp directory, never
/// in the profile.
const VAULT_FILE_NAME: &str = "gamelib-dev-secret-vault.json";

/// The vault is used only for the exact value `1` in a dev build. `true`, `yes`, an unset variable
/// or a packaged build all use the keyring: a stray value must never switch plaintext storage on.
pub(crate) fn use_dev_vault(env: Option<&str>, is_dev: bool) -> bool {
    env == Some("1") && is_dev
}

/// The key each slot has in the vault file (the TS `VaultSlot` names).
fn vault_key(slot: Slot) -> &'static str {
    match slot {
        Slot::Itad => "itadApiKey",
        Slot::SteamGridDb => "steamGridDbApiKey",
    }
}

/// `[dev-secret-vault] read key=<slot>`: the slot identifier only, never a value.
fn vault_read_line(slot: Slot) -> String {
    format!("[dev-secret-vault] read key={}", vault_key(slot))
}

/// `[dev-secret-vault] write key=<slot> op=<store|wipe>`: the direction is chosen by the call site,
/// never derived from the value.
fn vault_write_line(slot: Slot, wipe: bool) -> String {
    let op = if wipe { "wipe" } else { "store" };
    format!("[dev-secret-vault] write key={} op={op}", vault_key(slot))
}

/// The plaintext dev vault for the ITAD and SteamGridDB slots.
pub(crate) struct DevVaultSecretSource {
    path: PathBuf,
    /// One read-modify-write at a time in this process.
    rmw: Mutex<()>,
}

impl DevVaultSecretSource {
    /// Creates the vault file (an empty object) if it is missing and asserts mode `0600` either way.
    /// An error means the vault must not be used. A path that is a symlink is refused: the temp
    /// directory can be shared, and a write must not follow a link someone else planted.
    pub(crate) fn create(path: PathBuf) -> Result<DevVaultSecretSource, String> {
        if std::fs::symlink_metadata(&path).is_ok_and(|m| m.file_type().is_symlink()) {
            return Err("symlink".to_string());
        }
        if !path.exists() {
            write_owner_only(&path, b"{}")?;
        }
        assert_owner_only(&path)?;
        Ok(DevVaultSecretSource {
            path,
            rmw: Mutex::new(()),
        })
    }

    /// The file as a JSON object: a missing, unreadable or corrupt file is "nothing stored yet".
    fn read_map(&self) -> serde_json::Map<String, Value> {
        std::fs::read(&self.path)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
            .and_then(|v| match v {
                Value::Object(map) => Some(map),
                _ => None,
            })
            .unwrap_or_default()
    }

    fn write_slot(&self, slot: Slot, value: &str, wipe: bool) -> Result<(), String> {
        shell_log(&vault_write_line(slot, wipe));
        let _guard = self.rmw.lock().unwrap_or_else(|e| e.into_inner());
        // Every other slot in the file (Steam, Humble) is kept as it is.
        let mut map = self.read_map();
        map.insert(
            vault_key(slot).to_string(),
            Value::String(value.to_string()),
        );
        let text = serde_json::to_string_pretty(&Value::Object(map))
            .map_err(|_| "unavailable".to_string())?;
        write_owner_only(&self.path, text.as_bytes())?;
        assert_owner_only(&self.path)
    }
}

impl SecretSource for DevVaultSecretSource {
    fn get(&self, slot: Slot) -> Result<Option<String>, String> {
        shell_log(&vault_read_line(slot));
        Ok(match self.read_map().get(vault_key(slot)) {
            Some(Value::String(v)) if !v.is_empty() => Some(v.clone()),
            _ => None,
        })
    }

    fn set(&self, slot: Slot, value: &str) -> Result<(), String> {
        self.write_slot(slot, value, false)
    }

    /// A wipe stores the empty string, as the TS vault does: it reads back as "never stored".
    fn delete(&self, slot: Slot) -> Result<(), String> {
        self.write_slot(slot, "", true)
    }
}

/// Writes `bytes`, creating the file with owner-only permissions on Unix. Errors are a fixed
/// category.
fn write_owner_only(path: &Path, bytes: &[u8]) -> Result<(), String> {
    use std::io::Write;
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options
        .open(path)
        .and_then(|mut file| file.write_all(bytes))
        .map_err(|_| "write-failed".to_string())
}

/// Re-asserts `0600` after every write: a mode set once can be widened later by another tool, and
/// `mode` on `open` only applies at creation. A no-op off Unix.
#[cfg(unix)]
fn assert_owner_only(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
        .map_err(|_| "mode-failed".to_string())?;
    let mode = std::fs::metadata(path)
        .map_err(|_| "mode-failed".to_string())?
        .permissions()
        .mode()
        & 0o777;
    if mode == 0o600 {
        Ok(())
    } else {
        Err("mode-failed".to_string())
    }
}

#[cfg(not(unix))]
fn assert_owner_only(_path: &Path) -> Result<(), String> {
    Ok(())
}

/// Which source `choose_source` picked; named in the one log line the install writes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum SourceKind {
    Keyring,
    DevVault,
}

impl SourceKind {
    fn word(self) -> &'static str {
        match self {
            SourceKind::Keyring => "keyring",
            SourceKind::DevVault => "dev-vault",
        }
    }
}

/// The source for these inputs: the vault when [`use_dev_vault`] allows it and the file can be made
/// owner-only, the keyring otherwise (a vault that cannot be made safe is refused, never degraded).
fn choose_source(
    env: Option<&str>,
    is_dev: bool,
    temp: &Path,
) -> (Arc<dyn SecretSource>, SourceKind) {
    if env == Some("1") && !is_dev {
        shell_log("[dev-secret-vault] REFUSED: packaged build; GAMELIB_DEV_SECRET_VAULT ignored");
    }
    if use_dev_vault(env, is_dev) {
        let path = temp.join(VAULT_FILE_NAME);
        match DevVaultSecretSource::create(path.clone()) {
            Ok(vault) => {
                shell_log_detail(
                    "[dev-secret-vault] INSTALLED: info secrets are stored in PLAINTEXT, NEVER use in production",
                    &path.display(),
                );
                return (Arc::new(vault), SourceKind::DevVault);
            }
            Err(category) => {
                shell_log_detail(
                    &format!("[dev-secret-vault] REFUSED: could not create an owner-only vault file ({category})"),
                    &path.display(),
                );
            }
        }
    }
    (Arc::new(KeyringSecretSource), SourceKind::Keyring)
}

/// The source `install` hands the crate. Reads the variable once, here.
pub(crate) fn secret_source() -> Arc<dyn SecretSource> {
    let env = std::env::var(DEV_SECRET_VAULT_ENV).ok();
    let (source, kind) = choose_source(env.as_deref(), tauri::is_dev(), &std::env::temp_dir());
    shell_log(&format!("info secret source: {}", kind.word()));
    source
}

#[cfg(test)]
mod tests {
    use super::*;

    // Nothing here builds a keyring `Entry`: the Keychain is the operator's real one. The impl above
    // is the only place that calls `Entry::new` in this file.

    #[test]
    fn slot_account_is_the_keyring_dispatch_account_of_each_slot() {
        assert_eq!(slot_account(Slot::Itad), keyring_account("itad-api-key"));
        assert_eq!(
            slot_account(Slot::SteamGridDb),
            keyring_account("steamgrid-api-key")
        );
        // Pinned as literals too: a rename is a silent sign-out plus a fresh Keychain prompt.
        assert_eq!(slot_account(Slot::Itad), Ok("itad-api-key"));
        assert_eq!(slot_account(Slot::SteamGridDb), Ok("steamgrid-api-key"));
    }

    #[test]
    fn the_two_slots_have_distinct_accounts_and_never_name_another_slot() {
        let itad = slot_account(Slot::Itad).unwrap();
        let sgdb = slot_account(Slot::SteamGridDb).unwrap();
        assert_ne!(itad, sgdb);
        for other in ["steam-refresh-token", "humble-session", "humble-csrf"] {
            assert_ne!(itad, keyring_account(other).unwrap());
            assert_ne!(sgdb, keyring_account(other).unwrap());
        }
    }

    #[test]
    fn failures_cross_into_the_crate_as_a_category_never_a_message() {
        assert_eq!(failure_category("keyring:timeout"), "timeout");
        assert_eq!(
            failure_category("keyring:unavailable:Platform secure storage failure: -128"),
            "unavailable"
        );
        assert_eq!(failure_category("anything else"), "unavailable");
    }

    #[test]
    fn the_log_lines_carry_the_channel_account_and_outcome_only() {
        let line = keyring_outcome_message(
            CHANNEL_GET,
            slot_account(Slot::Itad).unwrap(),
            KeyringOutcome::Found,
        );
        assert_eq!(
            line,
            "keyring info_secret_get account=itad-api-key outcome=found"
        );
    }

    // ---- the dev vault ----

    #[test]
    fn the_vault_is_used_only_for_the_exact_value_one_in_a_dev_build() {
        assert!(use_dev_vault(Some("1"), true));
        assert!(!use_dev_vault(Some("1"), false), "a packaged build");
        assert!(!use_dev_vault(Some("true"), true));
        assert!(!use_dev_vault(Some("yes"), true));
        assert!(!use_dev_vault(Some("0"), true));
        assert!(!use_dev_vault(Some(" 1"), true));
        assert!(!use_dev_vault(Some(""), true));
        assert!(!use_dev_vault(None, true));
        assert!(!use_dev_vault(None, false));
    }

    #[test]
    fn the_vault_slot_names_are_the_ts_vault_slot_names() {
        assert_eq!(vault_key(Slot::Itad), "itadApiKey");
        assert_eq!(vault_key(Slot::SteamGridDb), "steamGridDbApiKey");
    }

    #[test]
    fn the_vault_log_lines_name_the_slot_and_direction_only() {
        assert_eq!(
            vault_read_line(Slot::Itad),
            "[dev-secret-vault] read key=itadApiKey"
        );
        assert_eq!(
            vault_write_line(Slot::SteamGridDb, false),
            "[dev-secret-vault] write key=steamGridDbApiKey op=store"
        );
        assert_eq!(
            vault_write_line(Slot::SteamGridDb, true),
            "[dev-secret-vault] write key=steamGridDbApiKey op=wipe"
        );
    }

    fn vault_in(home: &gamelib_testutil::FakeHome) -> DevVaultSecretSource {
        DevVaultSecretSource::create(home.root().join(VAULT_FILE_NAME)).unwrap()
    }

    #[test]
    fn a_vault_round_trips_the_two_slots_and_a_wipe_reads_as_empty() {
        let home = gamelib_testutil::FakeHome::new("info-vault-");
        let vault = vault_in(&home);
        assert_eq!(vault.get(Slot::Itad).unwrap(), None);
        vault.set(Slot::Itad, "itad-1").unwrap();
        vault.set(Slot::SteamGridDb, "sgdb-1").unwrap();
        assert_eq!(vault.get(Slot::Itad).unwrap().as_deref(), Some("itad-1"));
        assert_eq!(
            vault.get(Slot::SteamGridDb).unwrap().as_deref(),
            Some("sgdb-1")
        );
        vault.delete(Slot::Itad).unwrap();
        assert_eq!(vault.get(Slot::Itad).unwrap(), None);
        // The other slot is untouched, and the wipe left the empty string, as TS does.
        assert_eq!(
            vault.get(Slot::SteamGridDb).unwrap().as_deref(),
            Some("sgdb-1")
        );
        let text = std::fs::read_to_string(home.root().join(VAULT_FILE_NAME)).unwrap();
        let file: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(file["itadApiKey"], "");
    }

    #[test]
    fn a_vault_write_keeps_every_other_slot_in_the_file() {
        let home = gamelib_testutil::FakeHome::new("info-vault-");
        let path = home.root().join(VAULT_FILE_NAME);
        std::fs::write(
            &path,
            r#"{"steam-refresh-token":"steam-1","sessionCookie":"cookie-1","csrfToken":"csrf-1"}"#,
        )
        .unwrap();
        let vault = DevVaultSecretSource::create(path.clone()).unwrap();
        vault.set(Slot::Itad, "itad-1").unwrap();
        let file: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(file["steam-refresh-token"], "steam-1");
        assert_eq!(file["sessionCookie"], "cookie-1");
        assert_eq!(file["csrfToken"], "csrf-1");
        assert_eq!(file["itadApiKey"], "itad-1");
    }

    #[test]
    fn a_corrupt_vault_reads_as_empty_and_the_next_write_repairs_it() {
        let home = gamelib_testutil::FakeHome::new("info-vault-");
        let path = home.root().join(VAULT_FILE_NAME);
        std::fs::write(&path, "not json {").unwrap();
        let vault = DevVaultSecretSource::create(path.clone()).unwrap();
        assert_eq!(vault.get(Slot::Itad).unwrap(), None);
        vault.set(Slot::Itad, "itad-1").unwrap();
        assert_eq!(vault.get(Slot::Itad).unwrap().as_deref(), Some("itad-1"));
    }

    #[cfg(unix)]
    #[test]
    fn the_vault_file_is_owner_only_after_creation_and_after_every_write() {
        use std::os::unix::fs::PermissionsExt;
        let home = gamelib_testutil::FakeHome::new("info-vault-");
        let path = home.root().join(VAULT_FILE_NAME);
        let mode = |p: &Path| std::fs::metadata(p).unwrap().permissions().mode() & 0o777;
        let vault = DevVaultSecretSource::create(path.clone()).unwrap();
        assert_eq!(mode(&path), 0o600);
        // Another tool widens it; the next write puts it back.
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644)).unwrap();
        vault.set(Slot::Itad, "itad-1").unwrap();
        assert_eq!(mode(&path), 0o600);
        // An existing wider file is tightened on create, too.
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o666)).unwrap();
        DevVaultSecretSource::create(path.clone()).unwrap();
        assert_eq!(mode(&path), 0o600);
    }

    #[cfg(unix)]
    #[test]
    fn a_vault_path_that_is_a_symlink_is_refused() {
        let home = gamelib_testutil::FakeHome::new("info-vault-");
        let target = home.root().join("elsewhere.json");
        std::fs::write(&target, "{}").unwrap();
        let link = home.root().join(VAULT_FILE_NAME);
        std::os::unix::fs::symlink(&target, &link).unwrap();
        assert!(DevVaultSecretSource::create(link).is_err());
        assert_eq!(std::fs::read_to_string(&target).unwrap(), "{}");
    }

    #[test]
    fn choose_source_picks_the_vault_only_for_one_in_a_dev_build() {
        let home = gamelib_testutil::FakeHome::new("info-vault-");
        let file = home.root().join(VAULT_FILE_NAME);

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

        let (source, kind) = choose_source(Some("1"), true, home.root());
        assert_eq!(kind, SourceKind::DevVault);
        assert!(file.exists());
        source.set(Slot::Itad, "itad-1").unwrap();
        assert_eq!(source.get(Slot::Itad).unwrap().as_deref(), Some("itad-1"));
    }

    #[test]
    fn a_vault_that_cannot_be_created_falls_back_to_the_keyring() {
        let home = gamelib_testutil::FakeHome::new("info-vault-");
        // The temp directory does not exist, so the file cannot be created.
        let (_, kind) = choose_source(Some("1"), true, &home.root().join("missing"));
        assert_eq!(kind, SourceKind::Keyring);
    }
}
