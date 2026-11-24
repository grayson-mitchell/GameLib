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
//!
//! The file holds plaintext credentials in a directory other users can share, so it is never followed
//! through a link and never written in place (WR-21): a read opens it with `O_NOFOLLOW`, a write goes to
//! a sibling file created exclusively with mode `0600` and is `rename`d over the vault, so a link planted
//! at the vault path is replaced and not followed, and a crash or a concurrent reader never sees a
//! half-written file. A vault that does not parse is not treated as empty by a write (that would erase
//! the Steam and Humble slots that live in the same file): the write refuses with `corrupt`.
//!
//! Known limit: the in-process `rmw` mutex serialises only this process. The TS vault makes an unlocked
//! read-modify-write on the same file, so a Rust save racing a sidecar Steam token save can still lose
//! one of them. There is no lock the TS side would honour; the two writers must not save at the same
//! moment. This is dev-only (`GAMELIB_DEV_SECRET_VAULT=1`).

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

/// One bounded Keychain read of `account` (the shared core, Phase 94 D-18: the Humble source in
/// `humble_secrets.rs` makes these exact calls too, so the signed binary's ACL sees the same items).
/// `channel` labels the log line. A failure is the fixed category `timeout` or `unavailable`.
pub(crate) fn keyring_read_account(
    channel: &str,
    account: &'static str,
) -> Result<Option<String>, String> {
    let result = bounded_keyring_read(KEYRING_READ_TIMEOUT, move || {
        keyring_get_result(
            Entry::new(KEYRING_SERVICE, account).and_then(|entry| entry.get_password()),
        )
    });
    match result {
        Ok(Value::String(secret)) => {
            shell_log(&keyring_outcome_message(
                channel,
                account,
                KeyringOutcome::Found,
            ));
            Ok(Some(secret))
        }
        Ok(_) => {
            shell_log(&keyring_outcome_message(
                channel,
                account,
                KeyringOutcome::Absent,
            ));
            Ok(None)
        }
        Err(e) => {
            let kind = keyring_error_class(&e);
            shell_log_detail(
                &format!("keyring {channel} account={account} failed ({kind})"),
                &e,
            );
            Err(failure_category(&e).to_string())
        }
    }
}

/// One Keychain write of `account`, the shared core of the info and Humble sources.
pub(crate) fn keyring_write_account(
    channel: &str,
    account: &'static str,
    value: &str,
) -> Result<(), String> {
    match Entry::new(KEYRING_SERVICE, account).and_then(|entry| entry.set_password(value)) {
        Ok(()) => {
            shell_log(&keyring_outcome_message(
                channel,
                account,
                KeyringOutcome::Stored,
            ));
            Ok(())
        }
        Err(e) => {
            // The category is the variant's name; the error's own text stays on stderr.
            let kind = keyring_error_kind(&e);
            shell_log_detail(
                &format!("keyring {channel} account={account} failed ({kind})"),
                &format!("{e:?}"),
            );
            Err("unavailable".to_string())
        }
    }
}

/// One Keychain delete of `account`, the shared core of the info and Humble sources. Deleting an empty
/// slot is success, as in `rpc_keyring_delete`.
pub(crate) fn keyring_delete_account(channel: &str, account: &'static str) -> Result<(), String> {
    match Entry::new(KEYRING_SERVICE, account).and_then(|entry| entry.delete_credential()) {
        Ok(()) => {
            shell_log(&keyring_outcome_message(
                channel,
                account,
                KeyringOutcome::Deleted,
            ));
            Ok(())
        }
        Err(keyring::Error::NoEntry) => {
            shell_log(&keyring_outcome_message(
                channel,
                account,
                KeyringOutcome::Absent,
            ));
            Ok(())
        }
        Err(e) => {
            let kind = keyring_error_kind(&e);
            shell_log_detail(
                &format!("keyring {channel} account={account} failed ({kind})"),
                &format!("{e:?}"),
            );
            Err("unavailable".to_string())
        }
    }
}

/// The Keychain-backed source: the production [`SecretSource`] unless the dev vault is in use.
pub(crate) struct KeyringSecretSource;

impl SecretSource for KeyringSecretSource {
    fn get(&self, slot: Slot) -> Result<Option<String>, String> {
        keyring_read_account(CHANNEL_GET, slot_account(slot)?)
    }

    fn set(&self, slot: Slot, value: &str) -> Result<(), String> {
        keyring_write_account(CHANNEL_SET, slot_account(slot)?, value)
    }

    fn delete(&self, slot: Slot) -> Result<(), String> {
        keyring_delete_account(CHANNEL_DELETE, slot_account(slot)?)
    }
}

// ---- The dev vault (D-26) ----

/// The exact-match environment variable that opts a dev run into the vault.
pub(crate) const DEV_SECRET_VAULT_ENV: &str = "GAMELIB_DEV_SECRET_VAULT";

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
#[cfg(test)]
fn vault_read_line(slot: Slot) -> String {
    vault_read_line_for(vault_key(slot))
}

fn vault_read_line_for(key: &str) -> String {
    format!("[dev-secret-vault] read key={key}")
}

/// `[dev-secret-vault] write key=<slot> op=<store|wipe>`: the direction is chosen by the call site,
/// never derived from the value.
#[cfg(test)]
fn vault_write_line(slot: Slot, wipe: bool) -> String {
    vault_write_line_for(vault_key(slot), wipe)
}

fn vault_write_line_for(key: &str, wipe: bool) -> String {
    let op = if wipe { "wipe" } else { "store" };
    format!("[dev-secret-vault] write key={key} op={op}")
}

/// One read-modify-write at a time in this process, across every source over the file (the info and
/// the Humble source share one vault, and two mutexes would let their writes interleave).
static VAULT_RMW: Mutex<()> = Mutex::new(());

/// The plaintext dev vault: the ITAD and SteamGridDB slots here, the Humble slots through
/// `humble_secrets.rs` (Phase 94, D-18), all in the one file.
pub(crate) struct DevVaultSecretSource {
    path: PathBuf,
}

impl DevVaultSecretSource {
    /// Creates the vault file (an empty object) if it is missing and asserts mode `0600` either way.
    /// An error means the vault must not be used. A path that is a symlink is refused: the temp
    /// directory can be shared, and a write must not follow a link someone else planted.
    pub(crate) fn create(path: PathBuf) -> Result<DevVaultSecretSource, String> {
        if std::fs::symlink_metadata(&path).is_ok_and(|m| m.file_type().is_symlink()) {
            return Err("symlink".to_string());
        }
        match std::fs::symlink_metadata(&path) {
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                write_owner_only(&path, b"{}")?;
            }
            Err(_) => return Err("write-failed".to_string()),
        }
        assert_owner_only(&path)?;
        Ok(DevVaultSecretSource { path })
    }

    /// The file as a JSON object. A missing file is an empty store; a file that cannot be opened
    /// (a link included, as it is opened with `O_NOFOLLOW`) is `read-failed`, and one that is not a JSON
    /// object is `corrupt`.
    fn read_map_strict(&self) -> Result<serde_json::Map<String, Value>, String> {
        use std::io::Read;
        let mut options = std::fs::OpenOptions::new();
        options.read(true);
        no_follow(&mut options);
        let mut file = match options.open(&self.path) {
            Ok(file) => file,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(serde_json::Map::new()),
            Err(_) => return Err("read-failed".to_string()),
        };
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes)
            .map_err(|_| "read-failed".to_string())?;
        match serde_json::from_slice::<Value>(&bytes) {
            Ok(Value::Object(map)) => Ok(map),
            _ => Err("corrupt".to_string()),
        }
    }

    /// A read is total, as the TS vault's was: whatever [`Self::read_map_strict`] refuses is "nothing
    /// stored".
    fn read_map(&self) -> serde_json::Map<String, Value> {
        self.read_map_strict().unwrap_or_default()
    }

    fn write_slot(&self, slot: Slot, value: &str, wipe: bool) -> Result<(), String> {
        self.write_key(vault_key(slot), value, wipe)
    }

    /// The value stored under `key`, with the slot-only log line. Empty (a wipe) reads as "never stored".
    pub(crate) fn read_key(&self, key: &str) -> Option<String> {
        shell_log(&vault_read_line_for(key));
        match self.read_map().get(key) {
            Some(Value::String(v)) if !v.is_empty() => Some(v.clone()),
            _ => None,
        }
    }

    /// Stores `value` under `key` (a wipe stores the empty string, as the TS vault does). Every other
    /// key in the file (Steam, Humble, the other info slots) is kept as it is, so a vault that cannot be
    /// read back is refused and never rebuilt from nothing.
    pub(crate) fn write_key(&self, key: &str, value: &str, wipe: bool) -> Result<(), String> {
        shell_log(&vault_write_line_for(key, wipe));
        let _guard = VAULT_RMW.lock().unwrap_or_else(|e| e.into_inner());
        let mut map = self.read_map_strict()?;
        map.insert(key.to_string(), Value::String(value.to_string()));
        let text = serde_json::to_string_pretty(&Value::Object(map))
            .map_err(|_| "unavailable".to_string())?;
        write_owner_only(&self.path, text.as_bytes())?;
        assert_owner_only(&self.path)
    }
}

impl SecretSource for DevVaultSecretSource {
    fn get(&self, slot: Slot) -> Result<Option<String>, String> {
        Ok(self.read_key(vault_key(slot)))
    }

    fn set(&self, slot: Slot, value: &str) -> Result<(), String> {
        self.write_slot(slot, value, false)
    }

    /// A wipe stores the empty string, as the TS vault does: it reads back as "never stored".
    fn delete(&self, slot: Slot) -> Result<(), String> {
        self.write_slot(slot, "", true)
    }
}

/// `O_NOFOLLOW` on Unix, so a link at the path fails the open instead of being followed. A no-op
/// elsewhere.
fn no_follow(options: &mut std::fs::OpenOptions) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW);
    }
    #[cfg(not(unix))]
    let _ = options;
}

/// Writes `bytes` to `path` atomically: a sibling file is created exclusively (never through a link)
/// with owner-only permissions on Unix, filled, synced, and `rename`d over `path`. A link at `path` is
/// replaced by the rename and never written through, and a reader sees the old file or the new one,
/// not a truncated one. Errors are a fixed category.
fn write_owner_only(path: &Path, bytes: &[u8]) -> Result<(), String> {
    use std::io::Write;
    use std::sync::atomic::{AtomicU64, Ordering};
    static NEXT: AtomicU64 = AtomicU64::new(0);

    let (Some(dir), Some(name)) = (path.parent(), path.file_name()) else {
        return Err("write-failed".to_string());
    };
    let temp = dir.join(format!(
        ".{}.{}.{}.tmp",
        name.to_string_lossy(),
        std::process::id(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    ));
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    no_follow(&mut options);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let written = options.open(&temp).and_then(|mut file| {
        file.write_all(bytes)?;
        file.sync_all()
    });
    match written.and_then(|()| std::fs::rename(&temp, path)) {
        Ok(()) => Ok(()),
        Err(_) => {
            let _ = std::fs::remove_file(&temp);
            Err("write-failed".to_string())
        }
    }
}

/// Re-asserts `0600` after every write: a mode set once can be widened later by another tool, and
/// `mode` on `open` only applies at creation. The file is opened with `O_NOFOLLOW` and the mode is set
/// and read through that handle, so a link swapped in at the path is not chmod'ed. A no-op off Unix.
#[cfg(unix)]
fn assert_owner_only(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    let mut options = std::fs::OpenOptions::new();
    options.read(true);
    no_follow(&mut options);
    let file = options.open(path).map_err(|_| "mode-failed".to_string())?;
    file.set_permissions(std::fs::Permissions::from_mode(0o600))
        .map_err(|_| "mode-failed".to_string())?;
    let mode = file
        .metadata()
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
    pub(crate) fn word(self) -> &'static str {
        match self {
            SourceKind::Keyring => "keyring",
            SourceKind::DevVault => "dev-vault",
        }
    }
}

/// The vault when [`use_dev_vault`] allows it and the file can be made owner-only; `None` otherwise (a
/// vault that cannot be made safe is refused, never degraded). `what` names whose secrets the vault now
/// holds in the one install line ("info", "humble").
pub(crate) fn open_vault(
    env: Option<&str>,
    is_dev: bool,
    temp: &Path,
    what: &str,
) -> Option<DevVaultSecretSource> {
    if env == Some("1") && !is_dev {
        shell_log("[dev-secret-vault] REFUSED: packaged build; GAMELIB_DEV_SECRET_VAULT ignored");
    }
    if !use_dev_vault(env, is_dev) {
        return None;
    }
    let path = temp.join(VAULT_FILE_NAME);
    match DevVaultSecretSource::create(path.clone()) {
        Ok(vault) => {
            shell_log_detail(
                &format!("[dev-secret-vault] INSTALLED: {what} secrets are stored in PLAINTEXT, NEVER use in production"),
                &path.display(),
            );
            Some(vault)
        }
        Err(category) => {
            shell_log_detail(
                &format!("[dev-secret-vault] REFUSED: could not create an owner-only vault file ({category})"),
                &path.display(),
            );
            None
        }
    }
}

/// The source for these inputs: the vault when [`open_vault`] allows it, the keyring otherwise.
pub(crate) fn choose_source(
    env: Option<&str>,
    is_dev: bool,
    temp: &Path,
) -> (Arc<dyn SecretSource>, SourceKind) {
    match open_vault(env, is_dev, temp, "info") {
        Some(vault) => (Arc::new(vault), SourceKind::DevVault),
        None => (Arc::new(KeyringSecretSource), SourceKind::Keyring),
    }
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

    /// WR-21: a vault that does not parse reads as empty, but a write refuses instead of rebuilding
    /// the file from one slot, which would erase the Steam and Humble slots the sidecar keeps in it.
    #[test]
    fn a_corrupt_vault_reads_as_empty_and_a_write_refuses_and_leaves_the_file_alone() {
        let home = gamelib_testutil::FakeHome::new("info-vault-");
        let path = home.root().join(VAULT_FILE_NAME);
        std::fs::write(&path, "not json {").unwrap();
        let vault = DevVaultSecretSource::create(path.clone()).unwrap();
        assert_eq!(vault.get(Slot::Itad).unwrap(), None);
        assert_eq!(vault.set(Slot::Itad, "itad-1"), Err("corrupt".to_string()));
        assert_eq!(vault.delete(Slot::Itad), Err("corrupt".to_string()));
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "not json {");
    }

    /// WR-21: a write goes to a sibling file and is renamed over the vault, so nothing is left behind
    /// and the vault is never open for truncation.
    #[test]
    fn a_vault_write_is_atomic_and_leaves_no_temporary_file() {
        let home = gamelib_testutil::FakeHome::new("info-vault-");
        let vault = vault_in(&home);
        for n in 0..5 {
            vault.set(Slot::Itad, &format!("itad-{n}")).unwrap();
        }
        let mut names: Vec<String> = std::fs::read_dir(home.root())
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        assert_eq!(names, vec![VAULT_FILE_NAME.to_string()]);
    }

    /// WR-21: a link planted at the vault path after `create` is never read or written through.
    #[cfg(unix)]
    #[test]
    fn a_link_planted_after_create_is_not_followed_by_a_read_or_a_write() {
        let home = gamelib_testutil::FakeHome::new("info-vault-");
        let path = home.root().join(VAULT_FILE_NAME);
        let vault = vault_in(&home);
        vault.set(Slot::Itad, "itad-1").unwrap();
        let target = home.root().join("elsewhere.json");
        std::fs::write(&target, r#"{"itadApiKey":"planted"}"#).unwrap();
        std::fs::remove_file(&path).unwrap();
        std::os::unix::fs::symlink(&target, &path).unwrap();
        assert_eq!(vault.get(Slot::Itad).unwrap(), None, "the link is not read");
        assert!(vault.set(Slot::SteamGridDb, "sgdb-1").is_err());
        assert_eq!(
            std::fs::read_to_string(&target).unwrap(),
            r#"{"itadApiKey":"planted"}"#,
            "the link target is not written"
        );
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
