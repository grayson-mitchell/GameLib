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

use super::*;

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

/// The source `install` hands the crate.
pub(crate) fn secret_source() -> Arc<dyn SecretSource> {
    Arc::new(KeyringSecretSource)
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
}
