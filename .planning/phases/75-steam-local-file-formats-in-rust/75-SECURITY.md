---
phase: 75
slug: steam-local-file-formats-in-rust
status: verified
threats_open: 0
asvs_level: 1
created: 2026-11-16
---

# Phase 75 - Security

Verified against current code (HEAD `1d65dab25`; phases 76-80 have landed or are in flight, Phase 79 retired steam-user/steam-session). Paths are repo-relative. Phase 75 moved Steam's local file formats into the in-repo `gamelib-steamfiles` crate (text KV1 parser, binary KV codec for `shortcuts.vdf`, ACF reader/writer, library scan, root discovery, Valve client-manifest validator, localconfig/registry/installscript readers), exposed it through ten `steamfiles_*` rustInvoke channels and a headless CLI, retired the TS readers and the `@node-steam/vdf` / `steam-shortcut-editor` packages, and pinned the deletion with a gate test. Where a guard moved, was deleted with its test scaffolding, or was superseded the row says "Drift" or "SUPERSEDED".

Direct verification on 2026-11-16 (what was run):
- `cargo test -p gamelib-steamfiles` (from `src-tauri/`): every target ok - 20 lib unit (includes `panic_is_caught`, `every_op_dispatches_bad_args_on_empty_args`, atomic_write tests), 11 `acf_read`, 14 `discover`, 2 `golden`, 20 `kv_text`, 13 `library`, 22 `readers`, 10 `roundtrip`, 2 `security`, 25 `shortcuts`; 0 failed.
- `cargo test -p gamelib-depot --test finalize_op`: 10 passed, 0 failed.
- `cargo test -p gamelib-shell steamfiles`: `steamfiles_channels_are_gamelib_steamfiles_app_ops` 1 passed.
- Jest, one scoped run over `storeManagers/steam/localFiles`, `storeManagers/steam/__tests__`, `bridge/drm`, `depotRust`, `__tests__/steamFilesPortComplete`, `__tests__/cargoFeatures`, `sidecar/__tests__/shortcutsFlows`, `src/backend/shortcuts`: 145 suites passed, 1 skipped; 3209 tests passed, 7 skipped, 0 failed.
- Cheap re-checks: `git ls-files --eol` over the crate fixtures; `.gitattributes` lines 22-25; grep over fixtures for `/Users/`, `/home/<name>`, `7656119\d{10}`, `/tmp`, `/var/folders`; greps (assertions in the rows) over `src-tauri/crates/gamelib-steamfiles/src`, `src-tauri/src/steamfiles_dispatch.rs`, `src-tauri/crates/gamelib-depot/src/acf.rs`, `src/backend/**` and `meta/`; `grep -c` of the two removed npm packages in `package.json` and `pnpm-lock.yaml` (0 and 0).
- Read, not run: process-evidence rows (parity sweep, live UAT, CI legs, plan-time grep acceptance, SUMMARY test-mapping lists) are closed from the SUMMARY / UAT / PARITY / VERIFICATION records and labelled PROCESS. Not run: Windows `RegGetValueW` path (cfg(windows); read only), Windows/Linux CI legs, `pnpm smoke:sidecar`, the parity sweep (its harness `meta/steamFilesParitySweep.ts` was deleted by plan 27), anything touching the operator's Steam library, profile files, `~/Library` or `config.json`.

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| sidecar -> shell rustInvoke -> crate dispatch | JSON args validated by generated `Args`, then by crate `deny_unknown_fields` structs | paths, app ids, typed shortcut mutation |
| CLI argv / ndjson -> crate | headless census / dev tools | op name, JSON object |
| Steam files on disk -> parsers (ACF, libraryfolders, registry.vdf, localconfig.vdf, installscript, shortcuts.vdf) | Steam, other launchers and the user write them; content is untrusted | text KV1, binary KV |
| Valve CDN -> manifest file -> `parse_valve_manifest` | network-sourced text, written by TS into the run's temp dir | manifest text |
| ACF installdir -> filesystem paths | raw value returned by the reader; containment lives in TS `sanitizeInstalldir` and Rust `resolve_contained_path` | path segment |
| registry / env -> discovery -> sidecar env | `SteamPath`, `GAMELIB_STEAM_ROOT_DEFAULT` | path string |
| shortcuts.vdf shared with running Steam | concurrent writers | binary file |
| repo / fixtures / parity sweep / UAT records | personal data could leak into committed evidence | text |

## Threat Register

Status key: CLOSED = verified in current code or by a direct run; SUPERSEDED = the named mitigation was replaced or its scaffolding deleted by a later plan (replacement verified); PROCESS = closed on SUMMARY/UAT/PARITY/VERIFICATION records, not re-observed; ACCEPTED = in the Accepted Risks log below; TRANSFERRED = in the Transfer log below, receiving control verified.

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-75-01 | DoS | mitigate | CLOSED | `gamelib-steamfiles/src/lib.rs:178-181` `dispatch` wraps `run_op` in `catch_unwind(AssertUnwindSafe(..))` -> `Err("{op}:panic")`; test `panic_is_caught` (:197, `__panic_probe` op) passes |
| T-75-02 | Tampering | mitigate | CLOSED | `lib.rs:76` `parse_args` (`{op}:bad-args`); `deny_unknown_fields` on every arg struct (:39,45,52,58,65,72) and on `ShortcutsOp`/`EntryField` (`shortcuts.rs:19,28`); test `every_op_dispatches_bad_args_on_empty_args` (:265) passes; shell re-validates through generated `Steamfiles*Args::from_args` (`src-tauri/src/steamfiles_dispatch.rs`, all ten handlers) |
| T-75-03 | Tampering | mitigate | CLOSED | `atomic.rs:43-80` `atomic_write`: `create_new` temp in the target's directory, `write_all`, `sync_all` (:73), `rename` (:75), `remove_file(&tmp)` on any error (:78). Unit tests `writes_and_leaves_no_temp`, error-path tests (`atomic.rs` tests) pass |
| T-75-SC (75-01) | Tampering | accept | ACCEPTED | AR-75-01 |
| T-75-04 | Info disclosure | mitigate | CLOSED | Fixtures carry synthetic values (`tests/fixtures/README.md:3`). Grep over `tests/fixtures` for `/Users/` and `/graysonmitchell`: 0 hits. `/home/<name>` and 17-digit hits are all in the `shortcuts/upstream/` family and its golden outputs: public Heroic test data (`redromnon`, `commandmc`, `niklas`; the same file `src/backend/shortcuts/nonesteamgame/__tests__/test_data/shortcuts_redromnon.vdf` is a committed upstream test fixture), the synthetic `/home/synthetic/icons/` paths, and the synthetic ids `76561197960287930` / `76561198999999999` named in the README. No operator path or account id (Observation O-1) |
| T-75-05 | Tampering | mitigate | CLOSED | `.gitattributes:22-25` `tests/fixtures/** -text`, `tests/fixtures/shortcuts/** binary`. `git ls-files --eol` over fixtures: 18 `i/-text`, 54 `i/lf`, 1 `i/crlf`, 2 `i/none`, every one `attr/-text` (the one CRLF fixture keeps CRLF in index and worktree). Byte-equality: `tests/roundtrip.rs::every_fixture_round_trips_byte_for_byte` passes |
| T-75-06 | Tampering | mitigate | SUPERSEDED | The Jest oracle harness the row names was deleted in plan 27 (`steamFilesPortComplete.test.ts` DELETED list pins `localFiles/__tests__/oracle` and `steamFilesGolden.test.ts` absent). Replacement: Rust tests stage fixtures with `tempfile` (`tests/shortcuts.rs:14 staged`, `tests/acf_read.rs`) and the kept replay tests run against the stub (`localFiles/__tests__/stubRustSteamFiles.test.ts`, `replayParity.test.ts`; in the Jest run above). No test writes under the repo or real Steam. |
| T-75-07 | Info disclosure | mitigate | CLOSED | Grep for `/tmp/` and `/var/folders` over `tests/fixtures` (goldens `expected.json`, `rust-results.json`, `overrides/`): 0 hits; `${FIXTURES}` placeholder in use |
| T-75-08 | DoS | mitigate | CLOSED | `kv_text.rs:265` `if stack.len() > limits.max_depth` checked before descent; `max_depth: 64` (:28). Tests `kv_text.rs::deep_nesting_is_rejected_without_overflow` (100 000 nesting, :221), `roundtrip.rs::deep_nesting_is_too_deep` (:119), `security.rs::deep_nesting_is_a_result_not_a_crash` (:58); all pass |
| T-75-09 | DoS | mitigate | CLOSED | `kv_text.rs:216` `bytes.len() > limits.max_bytes` before tokenising (64 MiB default :27); per-op caps set by readers: `acf.rs:33` 4 MiB, `library.rs:12` 4 MiB, `readers.rs:8,169,249` 512 KiB / 1 MiB / 4 MiB |
| T-75-10 | Tampering | mitigate | CLOSED | Typed `KvError` from `kv_text::parse`; readers map to `parsed: false` (`acf.rs:153-155`, `readers.rs` `fail("manifest did not parse")`); `security.rs::security_truncation_never_panics` runs every prefix through every op via dispatch; `kv_text.rs` prefix-truncation tests pass |
| T-75-11 | Tampering | accept | ACCEPTED | AR-75-02 |
| T-75-12 | DoS | mitigate | CLOSED | `discover.rs:136,155` `MAX_U16 = 32_768`, `bytes / 2 > MAX_U16` -> `None`; any non-`ERROR_SUCCESS` -> `None` (:155, :171). cfg(windows) only; read-verified, not run here (Windows CI leg is PROCESS evidence, see O-2) |
| T-75-13 | Elevation | mitigate | CLOSED | `discover.rs` has exactly two `unsafe` blocks (:144, :162), each with a `// SAFETY:` comment; size query first (:144-153) then `buf` sized from it (:158-160). Non-Windows build has no unsafe (`hkcu_string_impl` returns `None`, :124-127) |
| T-75-14 | DoS | mitigate | CLOSED | `kv_bin.rs:48-49` `BinLimits::shortcuts()` 16 MiB / depth 64; `parse_bin` checks length first (:172) and depth before descent (:152). Test `security.rs::deep_nesting_is_a_result_not_a_crash` passes; shortcuts reader and apply both parse through `BinLimits::shortcuts()` (`shortcuts.rs:123,238`) |
| T-75-15 | Tampering | mitigate | CLOSED | Unknown tag / truncation is a whole-file `BinError` (`kv_bin.rs`), `apply_shortcuts_locked` returns `fail("parse: ..")` before any write (`shortcuts.rs:240`). Tests `shortcuts.rs::truncated_refuses_every_op` (:326), `read_truncated` (:95) pass |
| T-75-16 | Tampering | transfer | TRANSFERRED | TR-75-01 |
| T-75-17 | DoS | mitigate | CLOSED | `acf.rs:153` `meta.len() > ACF_MAX_BYTES` (4 MiB) from metadata before `fs::read`; `scan_acfs` uses the same reader (`library.rs:36` also caps `libraryfolders.vdf` at `LIBRARY_MAX_BYTES`). Test in `tests/acf_read.rs` (oversize ACF) passes |
| T-75-18 | Tampering | mitigate | CLOSED | `gamelib-depot/src/acf.rs:45` re-exports `gamelib_steamfiles::acf::{..}`; depot golden/acf tests still pass: `cargo test -p gamelib-depot --test finalize_op` 10 passed (Phase 74 audit also records 38 acf + golden green). 75-07-SUMMARY: "depot tests/ untouched" |
| T-75-19 | Tampering | mitigate | CLOSED | `readers.rs:48-100` `parse_valve_manifest`: `MAX_VALVE_MANIFEST_BYTES` (512 KiB) checked from metadata (:53) and again on bytes (:60), forbidden keys `__proto__`/`constructor`/`prototype` rejected on raw text before parse (:67-73), then shape checks with `is_lower_hex`/`all_digits` (:44-46) and the TS reason strings. Tests in `tests/readers.rs` (22 passed) |
| T-75-20 | DoS | mitigate | CLOSED | `readers.rs:8,53` 512 KiB manifest cap; localconfig blob `LOCALCONFIG_BLOB_MAX_BYTES` 64 KiB (:281); localconfig text via `kv_text::Limits` depth 64 (`readers.rs:76,205,263`); package `size` bounded `1..=MAX_VALVE_PACKAGE_BYTES` (:117) |
| T-75-21 | Tampering | mitigate | CLOSED | `acf.rs:190-194` `is_valid_beta_key` (alnum or `.`/`_`/`-`, 1..=64); applied to every returned key: `acf.rs:257`, `readers.rs:347`. Test `readers.rs` localconfig beta key suite (:362 `blob_hex("bad key!")` fails the validator) passes |
| T-75-22 | DoS | mitigate | CLOSED | `readers.rs:281-282,331-335` `BinLimits { max_bytes: 64 KiB, max_depth: 8 }` for the localconfig hex blob |
| T-75-23 | Tampering | mitigate | CLOSED | `shortcuts.rs:334` write goes only through `atomic_write` (see T-75-03). `shortcuts.rs` tests `no_tmp` helper asserts no stray temp after add/remove (`add_appends_and_preserves_prefix`, `remove_first_match_and_rekey`) pass |
| T-75-24 | Tampering | mitigate | CLOSED | `shortcuts.rs:240-262`: parse error -> `fail`; missing file without `create_if_missing` -> `"missing"` (:252); no `shortcuts` root or non-map -> `"no-shortcuts-root"` (:259-262); non-list -> `"not-list"` (:264). Tests `truncated_refuses_every_op`, `refuses_missing_root_and_non_list` (:348), `add_missing_without_create` (:152) pass |
| T-75-25 | Tampering | accept | ACCEPTED | AR-75-03 (Drift note: Phase 75 review WR-03 tightened this inside the crate: `shortcuts.rs:200-220` per-path process-wide lock serialises concurrent edits; test `concurrent_adds_are_all_kept` :397 passes) |
| T-75-26 | Tampering | mitigate | CLOSED | `shortcuts.rs:147-160` `to_node`: `i32::try_from` then `u32` bit pattern, otherwise `Err("bad-int32")`, run on all fields before the file is read (`prepared`, :215-224). Tests `int32_range_checks` (:362), `u32_int32_stored_as_bit_pattern` (:374) pass |
| T-75-27 | DoS | mitigate | CLOSED | `library.rs:13,123` `MAX_DIR_ENTRIES = 20_000` -> skipped entry with `fileName ''`; per-ACF 4 MiB via `acf::read_acf` (T-75-17). Test `library.rs::scan_caps_directory_entries` (:158) passes |
| T-75-28 | Tampering | mitigate | CLOSED | `library.rs:173` `find_acf` returns `None` unless `app_id` is 1..=20 ASCII digits; `readers.rs:319` same for the localconfig app id; shell/TS also numeric-guard (`acfInstalledDepots.ts:20,35`). Test in `tests/library.rs` (13 passed) |
| T-75-29 | Tampering | transfer | TRANSFERRED | TR-75-02 |
| T-75-30 | Tampering | mitigate | CLOSED | See T-75-02: `deny_unknown_fields` on every struct; `lib.rs:230 "o:bad-args"` and `every_op_dispatches_bad_args_on_empty_args` pass; `lib.rs` also tests an unknown field is rejected |
| T-75-31 | DoS | mitigate | CLOSED | `tests/security.rs` (2 passed, 2.63 s): `security_truncation_never_panics` drives every fixture prefix through every read op via `gamelib_steamfiles::dispatch`; `deep_nesting_is_a_result_not_a_crash` through dispatch |
| T-75-32 | Info disclosure | mitigate | CLOSED | `rust-results.json` / `expected.json` / `invocations.json`: grep for `/tmp/`, `/var/folders`, `/Users/`: 0 hits; `${FIXTURES}` substitution. `tests/golden.rs` (2 passed) re-checks |
| T-75-33 | Tampering | mitigate | CLOSED | Every `rpc_steamfiles_*` handler in `src-tauri/src/steamfiles_dispatch.rs` calls the generated `Steamfiles*Args::from_args(args)?` (`ipc_contract.rs:1308,1320,1332,...` map errors to `{op}:bad-args`) before `gamelib_steamfiles::dispatch`. Test `tests::steamfiles_channels_are_gamelib_steamfiles_app_ops` passes |
| T-75-34 | DoS | mitigate | CLOSED | `src/backend/sidecar/sidecarRpc.ts:131-145` `UNBOUNDED_RUST_CHANNELS` contains no `STEAMFILES` channel (grep count 0), so each `steamfiles_*` call keeps the `RUST_INVOKE_TIMEOUT_MS` timer (:535-543); crate size and 20 000-entry caps (T-75-09, T-75-27) |
| T-75-35 | Info disclosure | accept | ACCEPTED | AR-75-04 |
| T-75-36 | Tampering | mitigate | CLOSED | `localFiles/rustSteamFiles.ts` `invokeSteamFiles` is typed by `SteamFilesArgsFor<C>` (strings, string arrays, typed mutation, `steamFilesTypes.ts`); `localFiles/__tests__/rustSteamFiles.test.ts:39` `// @ts-expect-error path must be a string, never bytes` (suite passes in the Jest run) |
| T-75-37 | Elevation | mitigate | CLOSED | Dev flags deleted: `steamFilesFlags.ts` pinned absent and `GAMELIB_STEAMFILES_TEXT` / `GAMELIB_STEAMFILES_SHORTCUTS` forbidden by `steamFilesPortComplete.test.ts` (18/18 in the Jest run); `grep -rn "GAMELIB_STEAMFILES_\|steamFilesFlags" src meta` outside the gate: 0 hits |
| T-75-38 | Tampering | accept | ACCEPTED | AR-75-05 |
| T-75-39 | DoS | mitigate | CLOSED | `src/backend/config.ts:44-52` `steamRootDefault` reads only `env.GAMELIB_STEAM_ROOT_DEFAULT` and returns a string; no filesystem call, no rustInvoke. Discovery runs in the shell before spawn (`src-tauri/src/sidecar.rs:155` `discover_default()`, env set :343,:395). Test `src/backend/__tests__/config.steamRootDefault.test.ts` |
| T-75-40 | Tampering | accept | ACCEPTED | AR-75-06 |
| T-75-41 | DoS | mitigate | CLOSED | One `steamfiles_scan_acfs` call per build: `library/installedMap.ts:43`; `library/acfState.ts:161,433` one scan per probe, taking `steamappsDirs: [..]` arrays; no per-ACF invoke loop at the call sites (grep over `RUST_STEAMFILES_SCAN_ACFS` shows the three sites only). `library.installedMap.test.ts` passes |
| T-75-42 | Repudiation | mitigate | PROCESS | `75-PARITY.md` status APPROVED (2026-11-14), 16 signed-off divergences DV-75-01..16, each with an operator acceptance; overrides in `tests/fixtures/overrides/*.json` carry `divergenceNote`. Replay tests (`replayParity.test.ts`) pass. The WR-02 delete-guard divergence is not in the DV list (VERIFICATION human item 3, signed off in `75-HUMAN-UAT.md` item 2); see O-3 |
| T-75-43 | Tampering | mitigate | CLOSED | `sanitizeInstalldir` still gates every delete/launch path: `cancelDelete.ts:166-175` (`!== installdir` -> refuse, throw -> refuse), `cancelDelete.ts:176-192` single-segment-under-`common/` check, `steamLaunchedDeps.ts:28`, `stopSteamLaunchedGame.ts:77`, `depot/sharedRedist.ts:17`, `installLocation.ts:197`. `cancelDelete.test.ts` passes |
| T-75-44 | DoS | mitigate | CLOSED | Full Steam backend Jest run: `storeManagers/steam/__tests__` + `localFiles` + `depotRust` + `bridge/drm` all pass (145 suites, 3209 tests, 0 failed); `runningPoll.ts:207-212` `inFlight` closure guard added for the now-async read |
| T-75-45 | Tampering | mitigate | CLOSED | `bridge/drm/valveClient.ts:502` `fetchText(url, { signal, maxBytes: MAX_VALVE_MANIFEST_BYTES })` (axios `maxContentLength`/`maxBodyLength` :203-204), then Rust cap + forbidden keys + shape (T-75-19); `parseValveClientManifestFile` (:133-149) fails closed to `'manifest did not parse'`. `valveClient.test.ts` passes |
| T-75-46 | Tampering | mitigate | CLOSED | `valveClient.ts:519-523` manifest written in `mkdtemp(join(root, '.partial-'))` with `{ mode: 0o600 }`; temp dir removed in the `finally` (:682-686, `fsp.rm(tempDir, { recursive: true, force: true })`) |
| T-75-47 | Info disclosure | mitigate | CLOSED | `meta/gamelibSteamfilesCli.ts:85` `createFakeHomeProfile({ prefix: 'gamelib-steamfiles-' })` per spawn, argv-form `spawnSync(cli, [op, JSON.stringify(args)])` (:87), no shell; census inputs are explicit paths. Gate `fakeHomeIsolation.test.ts` covers in-repo spawn sites |
| T-75-48 | Tampering | mitigate | CLOSED | `nonesteamgame.ts` has 0 `writeFileSync` (grep count 0); the write is `steamfiles_shortcuts_apply` -> `atomic_write` (T-75-03/23) |
| T-75-49 | Tampering | mitigate | CLOSED | Rust refuses to write on parse failure (T-75-24); `src/backend/shortcuts/nonesteamgame/__tests__/nonesteamgame.test.ts` and `sidecar/__tests__/shortcutsFlows.test.ts` pass (in the Jest run) |
| T-75-50 | Tampering | accept | ACCEPTED | AR-75-07 |
| T-75-51 | Tampering | mitigate | CLOSED | `gamelib-depot/src/acf.rs:182-183` `resolve_contained_path(&common, &spec.installdir)` first in `finalize`, which fails `PathTraversal` (`post.rs:114-127`). Test `finalize_op.rs::installdir_escape_is_an_error_result` (:150, `"../escape"`) passes |
| T-75-52 | Tampering | mitigate | CLOSED | `acf.rs:162-170` `preserve_installed_manifest` (cancelled, 0 bytes, 0 files, existing StateFlags & 4). Tests `finalize_op.rs::cancelled_over_installed_manifest_preserves_it_byte_identical` (:55) and `cancelled_over_truncated_installed_manifest_preserves_it` (:68) pass |
| T-75-53 | Elevation | mitigate | CLOSED | `acf.rs:71-83` `can_write_full_ownership` ANDs outcome Completed, 0 failures, non-empty non-"0" buildid, `all_files_verified`, `all_modes_applied`; `gamelib-depot/src/lib.rs:182` and `download.rs:765` set `all_files_verified: false` on the no-download paths. Test `finalize_op.rs::allow_full_ownership_still_fails_closed` (:102) passes |
| T-75-54 | DoS | accept | ACCEPTED | AR-75-08 |
| T-75-55 | Tampering | mitigate | CLOSED | `library/acfState.ts:160-171` catch around the scan returns `[UNKNOWN_CONFLICT]` (`'<unknown>'`, :189), commented `T-75-55`; the skipped-sibling arm (:178-184) does the same (WR-02). `library.acfState.test.ts` and `cancelDelete.test.ts` pass |
| T-75-56 | Tampering | mitigate | CLOSED | `cancelDelete.ts:194-203` rejection of `steamfiles_read_acf` -> `refuse(appId, 'manifest unreadable')` (commented `T-75-56`); installed refusal unchanged. `cancelDelete.test.ts` passes |
| T-75-57 | DoS | accept | ACCEPTED | AR-75-09 |
| T-75-58 | Tampering | mitigate | CLOSED | TS `depot/betaBranch.ts:32,107` `isValidBetaKey` before a candidate reaches an ACF or a CM request; Rust `is_valid_beta_key` (T-75-21) on every returned key |
| T-75-59 | Tampering | mitigate | CLOSED | `acfInstalledDepots.ts:20-62` ids kept as strings, `ID = /^\d{1,20}$/`; test `acfInstalledDepots.test.ts:43` "keeps a 19-digit manifest gid unchanged and passes dlcAppId through" passes; Rust ACF record ids are strings (`readers.rs`/`acf.rs` `installed_depots`) |
| T-75-60 | Tampering | mitigate | CLOSED | Rust ACF reader is strict (`acf.rs:153-155`, `parsed: false`); the TS wrappers map unreadable to `null` (`acfInstalledDepots.ts:28,38`, `if (!res.exists) return null`); divergence recorded as DV-75-02 (accepted 2026-11-14) |
| T-75-61 | DoS | mitigate | CLOSED | `library/runningPoll.ts:207-212` closure `inFlight` guard; tests `library.runningPoll.test.ts:301` "never overlaps itself" and `:796` "does not re-enter pollOnce while the previous read is still pending (inFlight guard)" pass |
| T-75-62 | Tampering | mitigate | CLOSED | Snapshot fields optional; test `macSteamAdoption.test.ts:450` "a snapshot without stateFlags/buildid reads not-adopted (DV-75-12)" passes; the pending-store validation is unchanged (store persists `{mtimeMs, content}` only) |
| T-75-63 | Tampering | accept | ACCEPTED | AR-75-10 |
| T-75-64 | Tampering | mitigate | CLOSED | `sanitizeInstalldir` before the spec (T-75-43, `library/resume.ts`), Rust `resolve_contained_path` again in `finalize` (T-75-51) |
| T-75-65 | Elevation | mitigate | CLOSED | `allowFullOwnership: false` on the two no-download TS finalize paths named by the plan: `depotRust/install.ts:167` and `library/resume.ts:243`; Rust gate fails closed anyway (T-75-53). See O-4 for the two `true` sites (a real install finalize, still gated in Rust) |
| T-75-66 | Info disclosure | mitigate | PROCESS | Sweep output was redacted (sha1 + basename, `<ROOT>`); the harness `meta/steamFilesParitySweep.ts` is deleted (pinned absent by `steamFilesPortComplete.test.ts`). Re-check: grep for `7656119\d{10}` and `/Users/` over `75-PARITY.md`, `75-UAT.md`, `75-HUMAN-UAT.md`: 0 hits |
| T-75-67 | Tampering | mitigate | PROCESS | 75-24-SUMMARY / `75-PARITY.md`: read-only ops only, shortcuts via the non-writing `steamfiles_shortcuts_roundtrip` (`lib.rs:88-116`, reads and compares, never writes - verified in code), no apply/finalize in the sweep; sweep exit 0 |
| T-75-68 | Info disclosure | mitigate | PROCESS | Same CLI spawn discipline as T-75-47 (`meta/gamelibSteamfilesCli.ts:85`); sweep run recorded in `75-PARITY.md` |
| T-75-69 | Repudiation | mitigate | PROCESS | `75-PARITY.md:3` "APPROVED (operator accepted every divergence, accept-all, 2026-11-14)"; each DV-75-01..16 row ends `accepted: yes (2026-11-14)` |
| T-75-70 | Tampering | mitigate | PROCESS | 75-25-SUMMARY: flip happened only after `75-PARITY.md` reached APPROVED; `75-PARITY.md:3` status APPROVED. The flip is itself moot at HEAD: the flags are deleted (T-75-37) |
| T-75-71 | Info disclosure | mitigate | PROCESS | `75-UAT.md` / `75-HUMAN-UAT.md` grep for SteamID64, `/Users/`: 0 hits; results record status words, byte counts and short notes only |
| T-75-72 | Info disclosure | mitigate | PROCESS | Same check on `75-UAT.md`: no tokens, ids or home paths |
| T-75-73 | Tampering | mitigate | PROCESS | `75-UAT.md` item 6/7: shortcuts.vdf 1015 -> 1543 -> 1015 bytes, `cmp` byte-identical to the pre-test backup, no `.tmp`, roundtrip `identical:true` before and after; copy kept in the session scratchpad, not the repo. Code side (atomic write, roundtrip op) re-verified in T-75-03/T-75-67 |
| T-75-74 | Repudiation | mitigate | CLOSED | `steamFilesPortComplete.test.ts` KEPT list pins `expected.json`, `invocations.json`, `rust-results.json`, `overrides/`, both crate `Cargo.toml` files and `meta/gamelibSteamfilesCli.ts`; all present on disk (`ls tests/fixtures`); replay tests (`acfUpdateReplay`, `adoptionReplay`, `bridgeReplay`, `installdirReplay`, `libraryReplay`, `shortcutsReplay`) present and green; `75-PARITY.md` retained |
| T-75-75 | Repudiation | mitigate | PROCESS | 75-28-SUMMARY lists every removed case with its Rust twin (e.g. "finalizes BEFORE it starts watching" -> depot_finalize ordering twin); the converted suites pass in the Jest run |
| T-75-76 | Repudiation | mitigate | PROCESS | 75-29-SUMMARY lists removed cases with Rust twins; suites pass |
| T-75-77 | DoS | accept | ACCEPTED | AR-75-11 |
| T-75-78 | Tampering | mitigate | CLOSED | Rust-path tests from plans 15-22 remain and pass (`library.acfState`, `library.installedMap`, `library.manifestFlags`, `macSteamAdoption`, `cancelDelete`, `acfInstalledDepots`, `library.resumeBreadcrumbs`: all in the 145-suite Jest run); fail-soft catches present: `acfState.ts:92`, `cancelDelete.ts:194`, `acfInstalledDepots.ts:61`. WR-01..08 fixes recorded in `75-REVIEW-FIX.md` |
| T-75-78a | Tampering | mitigate | CLOSED | Precondition met: accepted DV row `DV-75-12` in `75-PARITY.md:65` (zero-diff alternative not needed; `steam_pending_adoption.json` was empty on the dev Mac per the row). Test `macSteamAdoption.test.ts:450` passes. 75-31-SUMMARY:23 records which |
| T-75-79 | Tampering | mitigate | CLOSED | The TS manifest validator is gone; `readers.rs:48-100` keeps cap + forbidden keys + shape checks with the TS reason strings; `valveClient.ts:133-149` is the single caller. `readers.rs` tests (22 passed) cover each reason; `bridgeReplay.test.ts` still compares reasons |
| T-75-80 | Tampering | mitigate | CLOSED | `grep -c writeFileSync src/backend/shortcuts/nonesteamgame/nonesteamgame.ts` = 0 |
| T-75-81 | Repudiation | mitigate | CLOSED | `gamelib-depot/tests/finalize_op.rs:55,68` preserve tests (comment `acf.rs:160-161` names "73-18 Zomboid data loss"), 10 passed; 75-33-SUMMARY maps each deleted TS case to its Rust test |
| T-75-82 | Repudiation | mitigate | CLOSED | `grep -rn "GAMELIB_STEAMFILES_\|steamFilesFlags" src meta` outside the gate test: 0 hits; the gate test forbids both names (`FORBIDDEN` list) and passes 18/18 |
| T-75-83 | DoS | mitigate | PROCESS | 75-35-SUMMARY:31 both packages already absent from `package.json` / `pnpm-lock.yaml` (re-checked: 0 / 0 mentions), so no transitive dependent can load them; `pnpm install --frozen-lockfile --offline` passed at plan time. `build:sidecar` not re-run here |
| T-75-84 | Tampering | mitigate | CLOSED | `src/backend/__tests__/steamFilesPortComplete.test.ts`: DELETED paths absent, `FORBIDDEN` symbols (`parseKv1`, `parseAcfTree`, `decodeUserAppConfigBetaKey`, `finalizeToSteam`, `writeAppManifest`, both flags, both packages) absent from `src` and `meta` with comments stripped, `package.json` check, anti-vacuity self-test; 18/18 pass |
| T-75-SC (75-35) | Tampering | accept | ACCEPTED | AR-75-12 |

Counts: 87 rows = 73 mitigate + 12 accept + 2 transfer (the supplied register has 12 `accept` rows, not 13; no row is missing). By status, tallied from this table: CLOSED 60, SUPERSEDED 1 (T-75-06), PROCESS 12 (T-75-42, 66, 67, 68, 69, 70, 71, 72, 73, 75, 76, 83), ACCEPTED 12, TRANSFERRED 2, OPEN 0. T-75-SC is kept as one row per plan (75-01, 75-35); T-75-77 and T-75-78 (repeated in plans 30 and 31) are one row each.

## Accepted Risks Log

All accept rows were registered at plan time (`register_authored_at_plan_time`); each rationale is the plan's text, checked against current code where cheap.

| ID | Threat | Rationale (plan text) | Check |
|----|--------|-----------------------|-------|
| AR-75-01 | T-75-SC (75-01) new crate deps | No new crate names: `serde`, `serde_json`, `tempfile`, `windows-sys` were already in `Cargo.lock`; `cargoFeatures.test.ts` pins the name list | Confirmed: `gamelib-steamfiles/Cargo.toml` lists only those four (`windows-sys` under `cfg(windows)`, `tempfile` dev-only); `cargoFeatures.test.ts:218` names `gamelib-steamfiles` and `gamelib-steamfiles-cli`; suite passes |
| AR-75-02 | T-75-11 hostile `SteamPath` registry value | Same trust as today's settings value; result is only a default the user can override; every later file read is fail-soft | Confirmed: capped read (T-75-12) and fail-soft readers (T-75-10) |
| AR-75-03 | T-75-25 concurrent Steam rewrite between read and write | Same window as today; re-read on every call keeps it to one call; Steam rewrites on exit and GameLib already tells the user to restart Steam | Confirmed re-read per call (`shortcuts.rs:229-238`); in-process races now serialised by `path_lock` (:200-220), test `concurrent_adds_are_all_kept`. A race with the external Steam process remains by design |
| AR-75-04 | T-75-35 Steam root in shell logs | Local log only; same path already in settings and logs today | Confirmed: `sidecar.rs:335,388` log `GAMELIB_STEAM_ROOT_DEFAULT={steam_root}` to the local shell log |
| AR-75-05 | T-75-38 hand-set `GAMELIB_STEAM_ROOT_DEFAULT` | Same trust as the user-editable setting it defaults; all reads under it are fail-soft | Confirmed `config.ts:44-52` only returns the string; consumers are the fail-soft readers |
| AR-75-06 | T-75-40 installdir traversal into `installPath` | Unchanged from today: `installPath` is only reported and size-measured; deletion paths keep their own containment | Confirmed: deletion goes through `sanitizeInstalldir` (T-75-43) |
| AR-75-07 | T-75-50 title with control bytes in AppName | Same as today: written as a NUL-terminated string; titles come from the store catalogue | Confirmed `shortcuts.rs:140-145` `EntryField::Str` writes bytes as-is |
| AR-75-08 | T-75-54 unbounded call never answering | Same lifetime model as `depot_job_run`: pending entry holds no timer; the shell answers on completion | Record; `depot_finalize` is in `UNBOUNDED_RUST_CHANNELS` (`sidecarRpc.ts:136`) |
| AR-75-09 | T-75-57 init awaiting breadcrumb reads | One bounded read per breadcrumb app at init, same count as today | Record; each read is an `steamfiles_read_acf` call with the 4 MiB cap and the `RUST_INVOKE_TIMEOUT_MS` timer |
| AR-75-10 | T-75-63 wrong running-app id on malformed registry.vdf | Fail-soft 0 as today | Confirmed: `readers.rs` `read_running_app_id` returns 0 on any parse failure; `library.runningPoll.test.ts` passes |
| AR-75-11 | T-75-77 no fallback if a Rust read misbehaves in the field (also plan 31 copy) | Delete gate met (sweep, live UAT, three CI legs); D-08 scheduled this removal | Confirmed: gate recorded in `75-PARITY.md` (APPROVED), `75-UAT.md` 8/8 pass, `75-HUMAN-UAT.md` 3/3 pass (CI run 43525676610 green per `75-VERIFICATION.md`) |
| AR-75-12 | T-75-SC (75-35) package changes | Removals only; no installs in this phase | Confirmed: `package.json` / `pnpm-lock.yaml` have 0 mentions of either removed package |

## Transfer Log

| ID | Threat | Transferred to | Check |
|----|--------|----------------|-------|
| TR-75-01 | T-75-16 installdir with traversal segments | TS `sanitizeInstalldir` / `acfInstalldir` and depot `resolve_contained_path`; the reader returns the raw decoded value (D-07 declared in 75-07-PLAN) | Receiving controls verified in current code: `installLocation.ts:197` `sanitizeInstalldir`, `acfInstalldir.ts:6-22` (single implementation), `cancelDelete.ts:166-192`, `gamelib-depot/src/post.rs:114-127` `resolve_contained_path` (used at `acf.rs:183`). Tests `acfInstalldir.test.ts`, `cancelDelete.test.ts`, `finalize_op.rs::installdir_escape_is_an_error_result` pass |
| TR-75-02 | T-75-29 installdir/path values steering later filesystem work | Same TS containment as TR-75-01 | Same verification as TR-75-01 |

## Unregistered Flags

None. No `## Threat Flags` section exists in 75-01..35-SUMMARY.md, and no new attack surface was found without a register row.

## Observations

- O-1 (information): `tests/fixtures/shortcuts/upstream/` and the goldens derived from it contain `/home/<name>` strings (`redromnon`, `commandmc`, `niklas`) that come from Heroic's public upstream test data (the same data is committed under `src/backend/shortcuts/nonesteamgame/__tests__/test_data/`). They are third-party public strings, not the operator's data, and no `/Users/<operator>` path or real SteamID64 appears anywhere in the fixtures. The two 17-digit values (`76561197960287930`, `76561198999999999`) are synthetic constants named in the fixtures README. T-75-04 therefore holds as "no operator data", though the README's "synthetic values only" wording is not literally true for the upstream sub-directory.
- O-2 (information): the Windows registry path (`discover.rs` `hkcu_string_impl`, T-75-12/13) is `cfg(windows)` and was read-verified, not run. Its Windows CI proof is the CI run recorded in `75-HUMAN-UAT.md` (run 43525676610 green on macos, ubuntu, windows).
- O-3 (information): the WR-02 co-install delete-guard change (sibling-ACF skipped -> `'<unknown>'` conflict, T-75-55) is signed off in `75-HUMAN-UAT.md` item 2 but is not a DV row in `75-PARITY.md`. It is a conservative change (more refusals, never fewer) and the guard is verified in code and tests above.
- O-4 (information): T-75-65 names "both TS finalize paths" as `allowFullOwnership: false`. The two no-download paths (`depotRust/install.ts:167`, `library/resume.ts:243`) are false. The real install finalize at `depotRust/install.ts:201` sends `opts.signal?.aborted !== true` and `depotRust/secondary.ts:265` sends `true`; both are subject to the Rust `can_write_full_ownership` gate (outcome Completed, no failures, buildid, verified, modes), which is the actual control (T-75-53), so TS cannot claim full ownership by itself.
- O-5 (drift): Phase 79 retired steam-user/steam-session; the Phase 75 TS consumers that remain (`acfInstalledDepots.ts`, `acfState.ts`, `cancelDelete.ts`, `installedMap.ts`, `valveClient.ts`, `nonesteamgame.ts`) were verified on current code. The Jest scaffolding named by plans 03/11 (oracle harness, `${FIXTURES}` normaliser, parity sweep) was deleted by plan 27 as scheduled, and its protections are carried by the committed goldens, replay tests and the Rust suites.
- O-6 (information): `git status` at audit time shows uncommitted edits only under `src/frontend/screens/Game/GamePage` (Phase 74 working tree, Observation O-1 in `74-SECURITY.md`) and `.planning/`; no uncommitted edits under `src-tauri/` or `src/backend`.

## Security Audit Trail

| Date | Event | Result |
|------|-------|--------|
| 2026-11-16 | Phase 75 threat verification, ASVS 1, block_on open; 87 rows (73 mitigate, 12 accept, 2 transfer) against HEAD `1d65dab25` | threats_open 0; 60 CLOSED, 1 SUPERSEDED, 12 PROCESS, 12 ACCEPTED, 2 TRANSFERRED; no unregistered flags |
