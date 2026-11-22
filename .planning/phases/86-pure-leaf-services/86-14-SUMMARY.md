---
phase: 86-pure-leaf-services
plan: 14
subsystem: info-secrets
tags: [secrets, keyring, itad, steamgriddb, dev-vault, migration, baked-key, release-workflow, d-19, d-25, d-26]

requires:
  - phase: 86-pure-leaf-services
    provides: "86-03 InfoCtx/SecretSource/EnvSecretSource, 86-08 info_dispatch install, 86-07 ITAD golden keyPerRequest labels"
provides:
  - "src-tauri/src/info_secrets.rs: KeyringSecretSource, DevVaultSecretSource, slot_account, use_dev_vault, choose_source"
  - "gamelib-info::secrets: ItadKey (get, set, effective, mark_rejected, is_rejected), SgdbKey (get, set, invalidate), KeySource, ResolvedKey, migrate_sgdb_plaintext, MigrationOutcome, FAILURE_MEMO_MS"
  - "InfoCtx.itad_key and InfoCtx.sgdb_key owners (per-context read cache and rejected flag); install fills secrets, itad_baked_key and itad_env_key"
  - "build.rs rerun-if-env-changed=ITAD_API_KEY; release-tauri.yml tauri-action step carries ITAD_API_KEY; meta/__tests__/releaseItadKey.test.ts"
affects: [86-15, 86-16]

actuals:
  tokens: 18300
  tasks: 3
  commits: 3

key-files:
  created:
    - src-tauri/src/info_secrets.rs
    - src-tauri/crates/gamelib-info/tests/secrets.rs
    - meta/__tests__/releaseItadKey.test.ts
  modified:
    - src-tauri/crates/gamelib-info/src/secrets.rs
    - src-tauri/crates/gamelib-info/src/ctx.rs
    - src-tauri/src/info_dispatch.rs
    - src-tauri/src/main.rs
    - src-tauri/build.rs
    - .github/workflows/release-tauri.yml

key-decisions:
  - "The key owners live in InfoCtx (itad_key, sgdb_key), not in statics: one Arc<InfoCtx> is one process in the shell, tests get fresh owners, and 86-15/86-16 reach them as ctx.itad_key / ctx.sgdb_key."
  - "Owner get returns Result<Option<String>, String>: Err only for `<op>:no-secret-source` or `<op>:secret-<category>` (timeout|unavailable), never a value; a failed read is memoised for 120 s (the TS KEYRING_FAILURE_MEMO_MS) so a denied Keychain prompt is not repeated. effective() is total like the TS owner: a missing or failing source only means no user key."
  - "A successful set caches the written value (TS setToken does); the migration therefore drops the cache before its read back so the proof is a real Keychain round trip."
  - "The migration clears the renderer mirror (store/config.json settings.steamGridDbApiKey) first and the settings document last, as TS setSetting ordered them, and keeps the document as the trigger until everything else is clean. The document is rewritten whole through Op::Replace from the host snapshot, so every other key keeps its bytes."
  - "A whitespace-only plaintext is NothingToDo, not a clear: SgdbKey.set trims and an empty value deletes, which would erase a real stored key. TS stored the whitespace string raw; Rust trims, so a padded key is stored trimmed and the read back compares the trimmed value."

patterns-established:
  - "Shell secret sources return fixed categories only (`timeout`, `unavailable`); the OS error text goes to stderr via shell_log_detail and never into gamelib.log or the crate."
  - "choose_source(env, is_dev, temp) -> (source, SourceKind) is the testable seam for the vault gate; tests drive it with a FakeHome temp dir and never build a keyring Entry."

requirements-completed: []

plan_head_before: ca21e71dfece9d3561f00eccbc2f76328badbc7d
plan_head_after: 1c9174dc7b0b26f8d7fd06b1c2feb0416d0bd4ac
commits: 3
status: complete
---

# Phase 86 Plan 14: API-key owners, dev vault, migration and baked ITAD key Summary

**The Rust leaves now read and write the ITAD and SteamGridDB keys from the unchanged `itad-api-key` / `steamgrid-api-key` Keychain slots through a shell `KeyringSecretSource`, with the TS owner semantics (trim, empty clears, cache, 120 s failure memo, ITAD `rejected` flag, user > env > baked precedence), a `GAMELIB_DEV_SECRET_VAULT=1` plus `tauri::is_dev()` plaintext vault for `pnpm tauri:dev`, the one-time plaintext SteamGridDB migration in TS's proof order (implemented and tested, wired in 86-15), and the baked ITAD key compiled into the shell and passed to the release Tauri build step.**

## Accomplishments

- Task 1 (tracer, `b1e70142d`): `info_secrets.rs` with `KeyringSecretSource` over the same `Entry` calls, the same bounded read (`KEYRING_READ_TIMEOUT`) and the `keyring_account` allowlist (no new slot name); one `shell_log` line per call naming channel, account and outcome only. Crate `ItadKey` / `SgdbKey` over `ctx.secrets`, living in `InfoCtx`. `install` sets `secrets`. 29 crate tests in `tests/secrets.rs` (precedence, trim, empty-clears, cache drop, rejected set/clear, failure memo, `<op>:no-secret-source`, migration cases) over `MemorySecretSource` and a counting probe; shell tests pin the slot-to-account mapping.
- Task 2 (`6879f0539`): `DevVaultSecretSource` (temp-dir `gamelib-dev-secret-vault.json`, 0600 re-asserted after every write, read-modify-write keeps the Steam and Humble slots, wipe stores `""` as TS does, corrupt file reads empty, a symlink path is refused) and `use_dev_vault(env, is_dev)` (exact `"1"` and dev only), with `choose_source` falling back to the keyring when the vault cannot be made owner-only. The `[dev-secret-vault] read key=<slot>` / `write key=<slot> op=store|wipe` lines are built by pure functions and carry no value. `migrate_sgdb_plaintext` (written in Task 1's commit with the owners it depends on) is covered by the migration cases in `tests/secrets.rs`.
- Task 3 (`1c9174dc7`): `build.rs` prints `cargo:rerun-if-env-changed=ITAD_API_KEY`; `install` fills `itad_baked_key` (`option_env!("ITAD_API_KEY")`) and `itad_env_key` (`GAMELIB_ITAD_API_KEY`, read once) and logs `itad key source: baked|env|none`; `release-tauri.yml` gives the `tauri-apps/tauri-action` step `ITAD_API_KEY: ${{ secrets.ITAD_API_KEY }}` (8 occurrences in the file, was 4); `meta/__tests__/releaseItadKey.test.ts` (11 tests, three mutation self-tests) pins the steps by index and the two Rust source lines.
- Tracer gate (auto, end to end): the Task 1 verify chain (crate secrets target, shell `info_secrets` and `keyring` filters, clippy `-D warnings`, formatting, no `keyring` in either crate tree) passed before expanding.

## Task Commits

1. Task 1 (tracer): `b1e70142d` feat(86-14): Keychain SecretSource and the ITAD and SteamGridDB key owners
2. Task 2: `6879f0539` feat(86-14): dev vault for the ITAD and SteamGridDB slots behind the exact-1 and is_dev gate
3. Task 3: `1c9174dc7` feat(86-14): bake the ITAD key into the Rust shell and pass it to the Tauri build step

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ctx.rs was edited although the plan did not list it**
- **Found during:** Task 1
- **Issue:** the owners need a per-process home and 86-15/86-16 need to reach them from an op; the plan named only secrets.rs for the crate.
- **Fix:** `InfoCtx` gained `itad_key: ItadKey` and `sgdb_key: SgdbKey`, initialised by `InfoCtx::new` (neutral defaults, no existing call site changed).
- **Files modified:** src-tauri/crates/gamelib-info/src/ctx.rs
- **Commit:** b1e70142d

**2. [Plan wording] `slot_account` returns `Result<&'static str, String>`**
- The plan said `-> &'static str`; `keyring_account` is fallible and a production `unwrap` on a renamed slot would panic, so it returns the allowlist's own `keyring:unknown-slot` error, which the source maps to the `unavailable` category. A shell test pins both slots to the literals and to `keyring_account`.

**3. [Rule 2 - Missing critical functionality] a whitespace-only plaintext must not delete a stored key**
- **Issue:** `SgdbKey::set` clears on an empty trimmed value, so migrating a whitespace-only `steamGridDbApiKey` would have deleted a real key already in the keyring.
- **Fix:** the migration trims and treats an empty result as `NothingToDo` (test `a_blank_setting_never_deletes_a_stored_key`). TS stored the raw whitespace string; this is a deliberate narrowing.

**4. [Plan wording] `MigrationOutcome` has a fifth variant, `Ciphertext`**
- A stored `sgdb:v1:` value (an Electron `safeStorage` ciphertext) can never be decrypted by Rust, and TS logged it and left it in place. A distinct outcome lets 86-15 log it the way TS did instead of folding it into `Failed`.

**5. [Plan wording] the migration clears two settings copies**
- TS `setSetting` wrote both the renderer mirror (`store/config.json` `settings`) and `config.json` `defaultSettings`. The migration does both through the host (mirror first, document last), because the settings-flavour store accepts only a whole-document `Op::Replace`. When the mirror has no `settings` object nothing is written there (TS would have written the whole merged config; `resyncSettingsMirror` already refreshes the mirror at boot).

**6. [Verify note] `rustfmt --check src/main.rs` reports diffs in `ipc_contract.rs`**
- `main.rs` pulls the generated, never-rustfmt-clean `ipc_contract.rs` into rustfmt's module walk (carry-forward from 86-08); none of the 116 hunks are in a file this plan touched. `info_secrets.rs`, `info_dispatch.rs`, `main.rs` and `build.rs` themselves are clean, as are `cargo fmt -p gamelib-info -- --check` and the crate tests.

## Verification

- `cargo test -p gamelib-info --features testing` (all targets, incl. 29 in `secrets`): pass. `cargo test --bin gamelib-shell`: 736 passed, 2 ignored (the two pre-existing live-Keychain probes). `cargo clippy -p gamelib-info --all-targets -- -D warnings`: clean; `cargo clippy --bin gamelib-shell`: no finding in a touched file.
- `cargo tree -p gamelib-info | grep -c keyring` = 0 and the same for `gamelib-info-cli`.
- `pnpm exec jest --selectProjects Meta` (88 suites passed, 2 skipped), `releaseWorkflow.test.ts` and `tauriShellSource.test.ts` pass; `pnpm codecheck` exit 0; `npx prettier --check` clean on the workflow and the new test (both confirmed not ignored); eslint clean on the new test.
- No test creates a keyring `Entry`: `Entry::new` appears in `info_secrets.rs` only inside the three `SecretSource` impls, never in `mod tests`. Nothing read the operator's real ITAD or SteamGridDB key.

## Notes for 86-15 and 86-16

- The migration is NOT called at boot: 86-15 wires `gamelib_info::secrets::migrate_sgdb_plaintext(&ctx)` in the same commit that deletes the TS migration, and logs the outcome (`Ciphertext` and `ReadBackFailed` were warnings in TS; no key text in any line).
- ITAD key for a request: `ctx.itad_key.effective(&ctx)` -> `Option<ResolvedKey { key, source }>`; `source.label()` is the golden's `keyPerRequest` word. On a 401/403 with `source == User`, call `ctx.itad_key.mark_rejected()` and retry once with `effective` again (it now skips the user key), as `withKey` does.
- `get` can block up to the shell's 45 s keyring read bound on a cold Keychain; call it before holding anything else.

## Known Stubs

None. (The migration being unwired until 86-15 is a scheduled hand-off, not a stub: it is implemented and tested.)

## Threat Flags

None. T-86-27 (no value in any log or error: categories only, the source word only), T-86-28 (vault needs exact `1` and `is_dev`, unit-tested, 0600, symlink refused) and T-86-29 (accounts only through `keyring_account`) are mitigated as planned.

## Self-Check: PASSED

- FOUND: src-tauri/src/info_secrets.rs, src-tauri/crates/gamelib-info/tests/secrets.rs, meta/__tests__/releaseItadKey.test.ts
- FOUND commits: b1e70142d, 6879f0539, 1c9174dc7
