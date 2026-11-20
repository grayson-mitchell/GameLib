---
phase: 63
slug: rust-migration-pattern-and-executable-scanners
status: verified
threats_open: 0
asvs_level: 1
created: 2026-11-10
---

# Phase 63 - Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Verified against the CURRENT tree. Plans 63-13/63-14 deleted the TS scanners, the TS oracle, the generator, the sweep tool and the scanner-selection flag, so threats that lived only in that code are closed as SUPERSEDED (surface removed), with the deletion proved by `src/backend/__tests__/scannerPortComplete.test.ts` (DELETED list + FORBIDDEN needles `GAMELIB_SCANNER_`, `OBJDUMP_BIN`, `/usr/bin/objdump`, `runScanner(`, deleted parser names; anti-vacuity >= 500 files) and by commit 5f009a126 (`refactor(63-14): delete the TS scanners, oracle, generator and sweep`).

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Untrusted game binary -> gamelib-scan parsers | PE/Mach-O bytes from installed games and Wine bundles | Attacker-shaped binary structure (offsets, RVAs, names) |
| Game directory -> contained_real | exe paths that may symlink outside the game folder | Filesystem paths |
| Sidecar -> Rust shell (rustInvoke) | scan_* channels, allow-listed on both sides; not in `generate_handler!` | String-only args (paths, appId), parse-fact results |
| meta/ tooling -> gamelib-scan-cli | census spawns the CLI | JSON args via argv, fake-HOME env |
| Planning artifacts -> repo | UAT/PARITY/fixtures committed | Redacted basenames, synthetic fixtures |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation / Evidence | Status |
|-----------|----------|-----------|-------------|-----------------------|--------|
| T-63-01 | Info disclosure / Tampering | contain.rs | mitigate | `contain.rs:53-80` canonicalizes root and path, `strip_prefix`, refuses empty remainder (`None => Escapes`) and `..`-prefixed first component; tests `symlink_escape_is_refused`, `symlinked_root_ancestor_resolves_inside` (contain.rs:132,145) | closed |
| T-63-02 | DoS | dispatch catch_unwind | mitigate | `lib.rs:115-117` `catch_unwind` -> `Err("<op>:panic")`; test `panic_is_caught` (lib.rs:165) with `__panic_probe` (cfg(test) only, lib.rs:109) | closed |
| T-63-03 | Tampering | op arg parsing | mitigate | `deny_unknown_fields` on all four arg structs (lib.rs:29-49); `parse_args` -> `<op>:bad-args` (lib.rs:58); shell also validates via generated Args (scan_dispatch.rs); test `scan_channels_are_gamelib_scan_app_ops` (main.rs) | closed |
| T-63-04 | Tampering (supply chain) | Cargo.lock | mitigate | gamelib-scan deps are serde, serde_json (+ tempfile dev-only) (Cargo.toml); crate-name pin test `cargoFeatures.test.ts:279` includes gamelib-scan and gamelib-scan-cli | closed |
| T-63-05 | Info disclosure | gamelib-scan-cli | accept | See Accepted Risks log (AR-63-01) | closed |
| T-63-06 | Tampering | objdump spawn / appId (oracle) | mitigate | SUPERSEDED: oracle objdump spawn deleted (scannerPortComplete DELETED + FORBIDDEN `/usr/bin/objdump`,`OBJDUMP_BIN`). Equivalent live controls: appId pre-check `importScan.ts:67` (`NUMERIC_APP_ID`) before invokeScan, Rust re-check test `closure_invalid_app_id_rejected_before_open` (closure.rs:662) | closed |
| T-63-07 | DoS | oracle readers | mitigate | SUPERSEDED: oracle deleted. Live: Rust ranged `FileReader::read_at` with `checked_add` range check (reader.rs:14-45), fd scoped to reader drop | closed |
| T-63-08 | Info disclosure | containedRealTs (oracle) | mitigate | SUPERSEDED: TS containment deleted. Rust `contained_real` is the only implementation (T-63-01 evidence); `drmScanExe.ts:53` `containLeaf` -> `scan_contained_real` | closed |
| T-63-09 | EoP | scanner flag | accept | SUPERSEDED and accepted: flag removed (FORBIDDEN `GAMELIB_SCANNER_`; grep of src/meta/src-tauri finds none). Rationale in AR-63-02 | closed |
| T-63-10 | Repudiation | diagnostics forwarding | mitigate | `importScan.ts:73-82` forwards Rust diagnostics to logWarning/logInfo; wrapper failure logs retained in peScan.ts, shimDrmWrapper.ts, drmScanExe.ts, gameLaunch.ts:874-887 | closed |
| T-63-11 | Info disclosure | committed fixtures | mitigate | No file in gamelib-scan (excl. target) > 64 KiB (`find -size +64k` empty; fixtures dir 644K total across many small .bin); synthetic builders per D-12; `${FIXTURES}` tokenise in golden.rs:18; `/Users/` count 0 in PARITY/PATTERNS/VERIFICATION/all SUMMARYs | closed |
| T-63-12 | Info disclosure | objdump spawn in meta/ | mitigate | genScanFixtures.ts deleted. Remaining spawn sites in meta/ covered by `fakeHomeIsolation.test.ts` (single exemption: sidecarStartupSmoke.cjs); bridgeCensus objdump arm is an explicit, tested exemption (scannerPortComplete "keeps the census objdump arm") with no `env` passed | closed |
| T-63-13 | Tampering | goldens drifting to match buggy port | mitigate | SUPERSEDED for generator (deleted, gate). `golden.rs:2-5` documents expected.json as frozen with explicit `rustOverride`; scannerPortComplete asserts expected.json exists | closed |
| T-63-14 | DoS | pe/* loop caps | mitigate | Caps present: MAX_SECTIONS 96 (pe/mod.rs:13), MAX_NAME_BYTES 256 (mod.rs:15), import descriptors 1024 / thunks 4096 (imports.rs:9,97), delay descriptors 256 / thunks 4096 (delay.rs:9-10), dir entries 4096 (drm.rs:10); tests `security_section_cap_96`, `security_caps_import_descriptors_1024`, `security_thunk_cap_4096`, `security_caps_descriptors_256`, `security_caps_thunks_4096`, `security_dir_entries_cap_4096`, name-cap tests | closed |
| T-63-15 | DoS | integer overflow RVA/offset | mitigate | Implemented as `saturating_add/mul` on u64 offsets plus `checked_add` range check in `reader.rs:14-18` (overflow saturates to u64::MAX and the read returns None -> not parsed); `macho.rs:28,45` uses `checked_add`; test `security_truncation_never_panics` (lib.rs:229), `macho_out_of_range_tables_are_none`. Wording differs from plan (saturating vs checked_*) but effect is equal | closed |
| T-63-16 | DoS | cyclic resource directory | mitigate | `drm.rs:75-78` zero sub-offset refused; traversal is a fixed two-level walk (top, sub), no recursion; test `security_self_referencing_directory` (drm.rs:256) | closed |
| T-63-17 | DoS | memory | mitigate | Ranged reads only (`RangeRead::read_at`); steamstub read capped `PE_SECTION_SCAN_BYTES = 8192` (sections.rs:9,63); name reads capped (drm.rs `MAX_NAME_UNITS`) | closed |
| T-63-18 | Tampering | panic in worker | mitigate | No `.unwrap()/.expect(` in non-test code of any gamelib-scan module (checked pre-`cfg(test)` of each file; only `unwrap_or_else` in pe/mod.rs:34); catch_unwind backstop (lib.rs:116) | closed |
| T-63-19 | Tampering / Info disclosure | closure path building | mitigate | `closure.rs:67-73` `is_followable_name` refuses `/`, `\`, `..`, system DLLs, api-ms/ext-ms; `is_direct_child_name` (closure.rs:86) enforces single Normal component; test `closure_dotdot_and_separator_names_refused` (closure.rs:560), `closure_system_dll_not_followed` | closed |
| T-63-20 | DoS | closure fan-out | mitigate | `CLOSURE_MAX_DEPTH = 2`, `CLOSURE_MAX_DLLS = 32` (closure.rs:14-15, loop 116, cap check ~131); tests `closure_depth3_is_not_followed`, `closure_33rd_dll_is_not_examined`, `closure_32nd_dll_is_examined` | closed |
| T-63-21 | Tampering | appId | mitigate | TS pre-check `importScan.ts:67`; Rust digits-only check before open; test `closure_invalid_app_id_rejected_before_open` (closure.rs:662) | closed |
| T-63-22 | Spoofing | conflict detection | mitigate | Typed errors for conflicts: tests `closure_conflict_both_headings_in_exe`, `closure_conflict_exe_vs_closure_arch`, `closure_conflict_import_vs_delay_arch` (closure.rs:389-421); `ScanResult::Error` variant | closed |
| T-63-23 | DoS | Mach-O parse | mitigate | `macho.rs` `checked_add` bounds (lines 28, 45); tests `macho_out_of_range_tables_are_none` (macho.rs:342), `macho_rejects_short_garbage_and_missing_symtab`, truncation sweep | closed |
| T-63-24 | EoP | new rustInvoke channels | mitigate | Allow-list both sides: `RUST_INVOKE_CHANNELS` (sidecarTransport.ts:624) and `ipc_contract.rs:166-171,220-225` + `rust_dispatch.rs:64`; `scanChannelParity.test.ts` ("every scan channel is allow-listed", channels == OPS minus CLI_ONLY); scan fns are `dispatch_rust_channel` arms (scan_dispatch.rs header), `generate_handler!` (main.rs:1781) contains no scan_ command (the only `scan_` hits in its range are include_str! file names) | closed |
| T-63-25 | Info disclosure | forged frame, arbitrary path | accept | See Accepted Risks log (AR-63-03) | closed |
| T-63-26 | DoS | rustInvoke hang | mitigate | `RUST_INVOKE_TIMEOUT_MS = 60_000` with `timer.unref()` (sidecarRpc.ts:65,455-466); catch_unwind guarantees reply; every wrapper maps rejection to a fail-closed value (peScan.ts, shimDrmWrapper.ts, machoExports.ts, importScan.ts, drmScanExe.ts) | closed |
| T-63-27 | Tampering | bytes on pipe | mitigate | `ScanContract` args all `string` (scanTypes.ts:93-100); `@ts-expect-error` test (rustScan.test.ts:41); no `Buffer/openSync/readSync/fs` in rustScan.ts, peScan.ts, machoExports.ts (grep empty) | closed |
| T-63-28 | DoS | sidecar exit contract | mitigate | rustScan.ts is one function, no timers/handles/import-time work (file read); timeout in sidecarRpc is unref'd. `pnpm smoke:sidecar` not re-run in this audit (UAT launches show clean sidecar) | closed |
| T-63-29 | Info disclosure / Tampering | drmScanExe candidates, shim fallback | mitigate | `drmScanExe.ts:111-154` every candidate through `containedUnder` -> `scan_contained_real` before `detect`; root = `dirname(exePath)`; shim no-bottle fallback uses `containedGameExeReal` (shimGenerate.ts:172) | closed |
| T-63-30 | Tampering | transport failure -> "safe" | mitigate | `drmScanExe.ts` containment failure -> `real: null` (skipped); `shimDrmWrapper.ts` catch -> `undefined`; `detectSteamDrmInPe` catch -> `parsed:false`; none map to 'none'/contained | closed |
| T-63-31 | Repudiation | DRM routing logs | mitigate | Warn lines preserved in drmScanExe.ts (`skipped ... escapes game folder`, `realpath failed`, `containment check failed`) and shimDrmWrapper.ts; UAT lines show live emission | closed |
| T-63-32 | Tampering | readLaunchExeCegMarkers fail-closed | mitigate | `gameLaunch.ts:867-888` readError -> `[]` + warning; unparsed -> `[]` + warning; transport reject yields readError via peScan catch | closed |
| T-63-33 | DoS | GameMaker MSAA whole-file read | accept | See Accepted Risks log (AR-63-04) | closed |
| T-63-34 | Info disclosure | scan path argument | mitigate | Only `{ exePath }` string crosses (peScan.ts:39, scanTypes ExePathArgs); no bytes | closed |
| T-63-35 | Tampering | appId -> scan | mitigate | `importScan.ts:67-73` pre-check returns before `invokeScan`; Rust re-check (closure.rs:662 test) | closed |
| T-63-36 | Spoofing | conflicting steam_api arch | mitigate | Rust typed error passed through unchanged (`importScan.ts:73-82` returns `result`); catch -> `{status:'error'}` (never ok) | closed |
| T-63-37 | DoS | boot-time export check | mitigate | `dxmt.ts:252-264` sequential loop over existing `-DXMT` dirs only; `invokeScan` has no handles; timeout unref'd | closed |
| T-63-38 | Tampering | DXMT gate fail-open | mitigate | `machoExports.ts` catch returns `ok:false`; `dxmt.ts:170-176,255-262` proceeds only on `check.ok` | closed |
| T-63-39 | Info disclosure | CLI spawns from meta/ | mitigate | Sweep tool deleted (SUPERSEDED). Remaining `meta/gamelibScanCli.ts:95-106` uses fresh `createFakeHomeProfile` per call with `dispose()` in finally; fakeHomeIsolation gate | closed |
| T-63-40 | Info disclosure | sweep report | mitigate | SUPERSEDED: scannerParitySweep.ts deleted (DELETED list in scannerPortComplete). 63-PARITY.md carries counts only (0 `/Users/`) | closed |
| T-63-41 | Tampering | command injection via paths | mitigate | `gamelibScanCli.ts:5,97` argv-form `spawnSync(cli, [op, JSON.stringify(args)])`, no shell | closed |
| T-63-42 | Repudiation | vacuous green sweep | mitigate | SUPERSEDED: sweep deleted; its permanent replacement is golden.rs (`rust_equals_ts_goldens_for_every_fixture_and_op`) plus anti-vacuity in scannerPortComplete | closed |
| T-63-43 | Tampering | cargo build under fake HOME | mitigate | `package.json:82,85` `scan-cli:build` runs as a prefix in the real env; gamelibScanCli.ts spawns only the CLI binary, not cargo (README line 55 documents this) | closed |
| T-63-44 | Info disclosure | PARITY / UAT docs | mitigate | `/Users/` count 0 in 63-PARITY.md; 1 hit in 63-UAT.md:31 is the operator's `cd` command for the repo path (no game/account data); basenames/appIds only | closed |
| T-63-45 | Tampering | defaults flipped on unproven parity | mitigate | SUPERSEDED: flag deleted. Historical gating evidence: PARITY shows 4/5 scanners `clean`, importScan 4 diffs user-accepted 2026-11-07 (63-PARITY.md:14-18) | closed |
| T-63-46 | Repudiation | live-gate evidence integrity | mitigate | 63-UAT.md contract has per-launch `pgrep` single-instance assertion (lines 29, 75, 82, 85), archived logs cited with line numbers | closed |
| T-63-47 | Info disclosure | session capture dir | mitigate | UAT quotes only scanner/impl and routing lines; capture dir is `$S` outside repo (UAT:31); no account data present in the file | closed |
| T-63-48 | Repudiation | split evidence | mitigate | UAT:19 shows preflight aborted launch P1 when a pre-existing instance was found; one shell PID recorded per launch | closed |
| T-63-49 | Tampering | stale sidecar | mitigate | UAT:103 mtime precondition (sidecar.js newer than newest src change); `impl=rust` lines cited for every scanner (UAT:49-53,103-127) | closed |
| T-63-50 | DoS / Tampering | losing the fallback | mitigate | Removal came after gate: PARITY zero-diff/accepted, live UAT pass, deletion in 5f009a126; permanent golden.rs + expected.json + security/closure tests run in `.github/workflows/rust-test.yml:114-117` on windows/macos/ubuntu matrix | closed |
| T-63-51 | Tampering | regression re-introducing TS parsers/flags | mitigate | `scannerPortComplete.test.ts` (DELETED stays deleted, FORBIDDEN grep, census-arm exemption, expected.json exists, anti-vacuity >= 500 files) | closed |
| T-63-52 | DoS | fail-closed mappings lost | mitigate | All catch mappings verified present in current wrappers (see T-63-26/30/32/38) | closed |
| T-63-53 | Info disclosure | containment (D-10) | mitigate | contain.rs + tests (T-63-01); drmScanExe routes every candidate through scan_contained_real (T-63-29) | closed |
| T-63-54 | DoS | losing regression coverage | mitigate | tests/fixtures/expected.json + golden.rs retained; gate asserts expected.json exists; CI step runs `cargo test -p gamelib-scan ...` | closed |
| T-63-55 | Info disclosure | pattern write-up | accept | See Accepted Risks log (AR-63-05) | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-63-01 | T-63-05 | gamelib-scan-cli reads no env and prints only facts about the paths handed to it; local developer/census tool, never bundled | Plan 63-01 (planner) | 2026-11-10 |
| AR-63-02 | T-63-09 | Scanner-selection flag was env-only and dev-only; both impls enforced the same containment and caps. Flag since removed entirely (63-13/63-14), so residual risk is nil | Plan 63-02 (planner) | 2026-11-10 |
| AR-63-03 | T-63-25 | Ops return parse facts only; the sidecar could already read these files; containment ops refuse escapes | Plan 63-06 (planner) | 2026-11-10 |
| AR-63-04 | T-63-33 | GameMaker MSAA whole-file read is pre-existing, bounded by MAX_EXE_SCAN_BYTES, out of scope (no new scanning capability) | Plan 63-08 (planner) | 2026-11-10 |
| AR-63-05 | T-63-55 | Documentation only; names repo files, no paths under HOME, no game data | Plan 63-14 (planner) | 2026-11-10 |

*Accepted risks do not resurface in future audit runs.*

---

## Unregistered Flags

None. 63-05 and 63-06 SUMMARY Threat Flags map to T-63-19..23 and T-63-24/26/27/28.

## Informational Notes (non-blocking)

- T-63-15 plan text says `checked_add/checked_mul`; code uses `saturating_*` plus a `checked_add` range gate in reader.rs. Behaviour is overflow -> not parsed; no gap.
- Stale doc: `src/backend/storeManagers/steam/bridge/peScan.ts` header still says `peSteamDrm.ts` "stays the pure TS oracle substrate", but that file is deleted. Comment-only.
- `pnpm smoke:sidecar` and `cargo test` were not executed in this audit; evidence is by code and test-name inspection.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-10 | 54 | 54 | 0 | gsd-security-auditor (Claude) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-10
