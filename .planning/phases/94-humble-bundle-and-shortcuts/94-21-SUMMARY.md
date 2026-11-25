---
phase: 94-humble-bundle-and-shortcuts
plan: 21
subsystem: secrets
tags: [rust, humble, keychain, keyring, dev-vault, migration, golden, d-18, fnd-07, t-94-38, t-94-39, t-94-40]
status: complete

requires:
  - phase: 94-humble-bundle-and-shortcuts
    provides: 94-09 secrets goldens (23) and the fake keyring oracle, 94-19 the typed Humble store layer, 94-13 the Humble context and shell seams
provides:
  - gamelib_humble::secrets (HumbleSlot, HumbleSecretSource, SecretRead, Unreadable, HumbleSecrets, UnavailableSecretSource, SecretMigration, MigrationOutcome, migrate_plaintext) and HumbleCtx.secrets / with_secrets
  - gamelib_humble::spawn_humble_migration and HUMBLE_MIGRATION_BOUND (bounded boot work, a humble-migration registrant)
  - src-tauri/src/humble_secrets.rs (KeyringHumbleSecretSource, DevVaultHumbleSecretSource, secret_source, start_humble_migration)
  - info_secrets.rs shared account-keyed core (keyring_read_account, keyring_write_account, keyring_delete_account, DevVaultSecretSource::read_key / write_key, open_vault)
  - tests/golden_secrets.rs replaying all 23 secrets goldens
affects: [94-22, 94-23, 94-25, 94-27, 94-29, 94-30, 94-32]

requirements-completed: []

actuals:
  tokens: 38000
  tasks: 3
  commits: 5

plan_head_before: c47be314f30f8249d60d36b18747e301669e2f41
plan_head_after: 2d58b6de1aa404df375d28d798b2b68206556995

tech-stack:
  added: []
  patterns:
    - "a golden whose recording carries no script is replayed by a scenario per case id, and the fake keyring is driven by the golden's own keyringCalls: each call the Rust makes must be the next recorded call (op, slot, written value, fake-clock time) and it answers what the recording answered or threw; an invalidateCache entry in the recording means the next call on that slot runs with a cold cache, checked through HumbleSecrets::cache_state at the moment of the call"
    - "a Keychain read that can wait on a person runs on the blocking pool holding a humble-keychain shutdown registrant that moves into the closure (an abandoned call still holds the exit drain within the one budget); a read is a detached task that clears its own pending slot, so a joiner is never left waiting on a read nobody drives"
    - "one process-wide read-modify-write mutex over the dev vault file, shared by the info and Humble sources, so two sources over one file cannot interleave"

key-files:
  created:
    - src-tauri/crates/gamelib-humble/src/secrets.rs
    - src-tauri/crates/gamelib-humble/tests/golden_secrets.rs
    - src-tauri/src/humble_secrets.rs
    - src/backend/humble/__tests__/oracle/legacyMigration.ts
  modified:
    - src-tauri/crates/gamelib-humble/src/ctx.rs
    - src-tauri/crates/gamelib-humble/src/lib.rs
    - src-tauri/crates/gamelib-humble/src/stores.rs
    - src-tauri/src/info_secrets.rs
    - src-tauri/src/humble_dispatch.rs
    - src-tauri/src/main.rs
    - src/backend/sidecar/humbleSecretStore.ts
    - src/backend/sidecar/bootstrap.ts
    - src/backend/sidecar/__tests__/humbleSecretStore.test.ts
    - src/backend/sidecar/__tests__/devSecretVault.test.ts
    - src/backend/humble/__tests__/oracle/secretsAlerts.oracle.test.ts

key-decisions:
  - "The TS migration is not deleted outright: it moves to src/backend/humble/__tests__/oracle/legacyMigration.ts as the oracle's reference copy. The 94-09 goldens were recorded from it and secretsAlerts.oracle.test.ts regenerates and compares them (write-or-compare), so deleting it would orphan 8 goldens. The shipped sidecar no longer contains migrateOneSecret( (the acceptance grep is 0); 94-30 deletes the oracle."
  - "A dev-vault run never migrates (start_humble_migration logs `skipped-dev-vault`). The TS boot took the vault arm exclusively so that a developer's boot never touches the Keychain; moving the migration to Rust would otherwise have written legacy plaintext into the plaintext vault and read the real Keychain under pnpm tauri:dev."
  - "SecretRead::Unavailable carries the reason (timeout or unavailable), not a bare unit as the plan's artifact list wrote it: the TS three-state read answers unreadable with a reason, the failure memo answers the ORIGINAL reason, and the goldens record both."
  - "A read failure writes two warnings (the failure and the memo line), a write, delete and probe failure one: equal to the TS goldens' warning counts, which the replay asserts. The plan's `one warning per failure` is the per-line rule; the count is the TS's. No line carries a value, a length or an OS message."
  - "Writes and deletes are not serialised behind an in-flight read (as the TS: a disconnect must not wait up to 45 s behind a stuck Keychain prompt); the epoch fence keeps a slow read from overwriting a newer write, and the replay proves it against the golden."
  - "clear() issues the two deletes in order (session then csrf) where the TS issued them concurrently: the order the golden records, and each is still independent of the other's outcome."

patterns-established:
  - "the shared account-keyed Keychain core in info_secrets.rs is the one place Entry::new is called for a secret slot; a new source passes a channel label and an account from keyring_account, never a literal"

requirements: [SVC-04]
duration: 95min
completed: 2026-11-24
---

# Phase 94 Plan 21: Humble secrets owner and boot migration in Rust Summary

**The Humble session cookie and CSRF token are owned by Rust (process-lifetime cache, in-flight dedupe, a 120 s failure memo, an epoch fence, invalidate-before-write) over the unchanged `humble-session` and `humble-csrf` keyring slots and the dev vault, replaying all 23 TS secrets goldens, and the one-time plaintext-to-Keychain migration now runs at Rust boot as bounded work with the TS boot no longer migrating.**

## What was built

- **`gamelib_humble::secrets` (Task 1, Task 2).** `HumbleSecretSource` is a blocking seam (`get`, `set`, `delete`, `available`) the shell implements; every error it answers is the fixed category `timeout` or `unavailable`. `HumbleSecrets` is the owner: a confirmed empty slot is cached as empty, concurrent readers share one source call (a read begun before `invalidate` is not joined), a failed read is remembered for `FAILURE_MEMO_MS` (120 000) on `ctx.clock` and answered as unreadable with the original reason, a read superseded by `invalidate` answers its caller and writes nothing, `set` and `delete` invalidate first and cache the new value (or empty) only on success, `clear` deletes both slots, `available` caches a success and not a failure, and `store` writes the secret and then `encryptionDegraded` off the probe. `migrate_plaintext(ctx)` writes the slot, drops the cache, reads the SOURCE back (not a cache), compares, and only on an exact match deletes the legacy config key and writes `encryptionDegraded` false; a rejected write, a failed read back and a different read back keep the plaintext with one fixed-text warning.
- **The golden replay (`tests/golden_secrets.rs`).** All 23 goldens replay; the case count equals the manifest, and the replay fails if the in-flight dedupe, the warning, the byte-compared config, the deleted-plaintext or the kept-plaintext cases do not run. Two deliberate breakages were run and caught (a migration that ignores a mismatched read back: 2 failures; an `invalidate` that does nothing: 13 failures). A second test pins the plan's acceptance line: after a mismatched read back the config bytes equal the bytes before.
- **Shell sources (`humble_secrets.rs`, `info_secrets.rs`).** `KeyringHumbleSecretSource` makes exactly the `Entry` calls `keyring_dispatch` and the info source make, through the shared `keyring_{read,write,delete}_account` core extracted from `info_secrets.rs` (same service, accounts resolved through `keyring_account`, the one bounded read through `KEYRING_READ_TIMEOUT`); its `available` calls the existing non-prompting `rpc_keyring_available` probe. `DevVaultHumbleSecretSource` reads and writes `sessionCookie` / `csrfToken` in `<temp>/gamelib-dev-secret-vault.json` through the info vault's O_NOFOLLOW read and exclusive-create-then-rename write, gated on `GAMELIB_DEV_SECRET_VAULT` exactly `1` AND `tauri::is_dev()`. The info and Humble sources share one read-modify-write mutex (it was a per-instance field). `humble_dispatch::install` passes `humble_secrets::secret_source()` into the context.
- **The boot move (Task 3).** `spawn_humble_migration` runs `migrate_plaintext` on the crate runtime holding a `humble-migration` registrant, abandoned after 10 s, reporting one word (`migrated`, `nothing-to-do`, `partial`, `failed`, `timeout`, `shutdown`, `panic`). `start_humble_migration` is called from `run_setup` right after `humble_dispatch::install`. In the same commit the TS `migrateOneSecret`, `migrateHumbleSecrets` and their deps left `sidecar/humbleSecretStore.ts`; `startSidecarHumbleSecretStore()` only logs its receipt line (the live gate greps for it) and the store keeps serving reads.

## Verification

- `cargo test -p gamelib-humble` 258 lib + all integration targets pass; `golden_secrets` 2/2; clippy `-D warnings` and `cargo fmt --check` clean on the crate.
- `cargo test --bin gamelib-shell` 871 pass (`humble` 86, `info_secrets` 13 and its test count is unchanged at 16 `#[test]`).
- `pnpm codecheck`, `pnpm find-deadcode` (PASS, baseline unchanged), `pnpm check:ipc-contract` (no new channel), `pnpm planning-gates` 12/12, and the jest gates `testContainment`, `fakeHomeIsolation`, `humblePortComplete`, `shortcutsPortComplete`, `infoPortComplete`, `humbleShortcutsShimSchedule`, `humbleFixtureRedaction`, `humbleSecretStore`, `secretsAlerts.oracle` all pass; prettier clean on every touched TS path.
- Acceptance greps: `migrateOneSecret(` in `humbleSecretStore.ts` is 0; `start_humble_migration` in `main.rs` is 1; the two slot literals in `humble_secrets.rs` are 6 and every account resolves through `keyring_account`.

## Pending the 94-32 live gate

Nothing here touched a real Keychain: every test uses a scripted source, a `FakeHome` or the dev vault in a temp folder. What can only be proven on a signed macOS build and is NOT proven here: that the signed-over-signed build raises no new Keychain prompt for `humble-session` / `humble-csrf` (T-94-39, D-09 item 1, D-10), and that the Rust `Entry` calls read the items the TS-era binary stored. The slot names, the service and the ACL-bound binary path are unchanged by construction (pinned as literals in `humble_secrets.rs` tests).

## Deviations from Plan

### Plan wording that could not hold as written

**1. "the TS migration and its calls are deleted".** Deleted from `sidecar/humbleSecretStore.ts` (grep 0), but a reference copy lives in `humble/__tests__/oracle/legacyMigration.ts` (key decision 1). The alternative, dropping the eight migration cases from the oracle, would leave their goldens orphaned and the MANIFEST count wrong.
**2. `SecretRead { Present, Absent, Unavailable }`.** `Unavailable` carries a reason (key decision 3).
**3. The Task 1 verify command `cargo test --bin gamelib-shell info_secrets humble`.** Cargo accepts one test filter; it was run as two commands (`humble`, `info_secrets`), both green.
**4. "branch phase-94-humble-shortcuts, rebased onto main, `pnpm gen:ipc-contract` re-run".** The branch is `gsd/phase-94-humble-bundle-and-shortcuts` (as the orchestrator said); no rebase was done (instructed not to); `pnpm check:ipc-contract` is up to date since no channel was added.

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `humble_secrets.rs` was missing from the shell source-text guard**
- **Found during:** the full `cargo test --bin gamelib-shell` run after Task 3
- **Issue:** `shell_source_files_names_every_shell_module_file` fails for any new shell module not named in `SHELL_SOURCE_FILES` and `SHELL_SOURCE`.
- **Fix:** named `humble_secrets.rs` in both lists in `main.rs` (two appended lines).
- **Commit:** 2d58b6de1

**2. [Rule 1 - Bug] two unused items after the shared-core extraction**
- **Found during:** clippy on the shell
- **Issue:** `vault_read_line` and `vault_write_line` in `info_secrets.rs` were used only by tests once the key-based forms existed.
- **Fix:** `#[cfg(test)]` on both. Their tests are unchanged.
- **Commit:** 802b905ed

## Windows-only and pre-existing failures

- `src/backend/sidecar/__tests__/devSecretVault.test.ts`: 6 tests fail on this Windows host (`expected the dev vault to be built`: the vault's owner-only mode 0600 cannot be asserted on NTFS). The two tests this plan edited in that file pass. CI is ubuntu and passes them; not caused by this branch (the Windows-local jest baseline note).
- `cargo clippy --bin gamelib-shell --all-targets -D warnings` reports 17 errors in files this plan did not touch (`wake_lock.rs`, `single_instance.rs`, `store_embed/state.rs`, `login_window/humble_helpers.rs`, `shell_state.rs`, `main.rs` test names); none in `humble_secrets.rs`, `info_secrets.rs`, `humble_dispatch.rs` or the Humble crate. `cargo fmt --all` also rewrites `src/ipc_contract.rs` (generated); it was reverted to HEAD and is untouched.

## Known limit

A user upgrading with a legacy plaintext cookie whose sidecar reads the session slot BEFORE the Rust migration finishes would cache `''` in the TS slot store until the next start (the TS migration invalidated its own cache; the Rust one cannot reach it). The Rust migration starts in `run_setup` before the sidecar is spawned and the sidecar's first Humble read comes after its own boot, so the window is a few seconds and only exists for a profile that still holds a plaintext secret. The SteamGridDB migration (86-15) has the same shape. Not mitigated here; 94-29 removes the TS store.

## Known Stubs

None.

## Threat Flags

None. The Humble dev-vault source is a mitigated T-94-40 surface (shared O_NOFOLLOW read, exclusive-create-then-rename write, env flag AND `tauri::is_dev()`), covered by the plan's threat model.

## Self-Check: PASSED

- Files found: `secrets.rs`, `golden_secrets.rs`, `humble_secrets.rs`, `legacyMigration.ts`, this summary.
- Commits found: 802b905ed, dafe7adb5, 126250b2f, 0a4599015, 2d58b6de1 (5 measured by `git rev-list --count c47be314f..HEAD` before the docs commit).
