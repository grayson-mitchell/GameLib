---
phase: 75-steam-local-file-formats-in-rust
verified: 2026-11-14T00:00:00Z
status: passed
human_verification_resolved: 75-HUMAN-UAT.md (3/3 pass, 2026-11-14; CI run 43525676610 green)
score: 7/7 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Push the post-review-fix commits (1cf90847c..cf8bb6d43) and confirm rust-test.yml is green on macos, ubuntu and windows"
    expected: "gamelib-steamfiles and gamelib-depot build and test on all three OSes. gamelib-depot could not be Windows-checked locally."
    why_human: "CI run 43505684860 (a869d5e8b) predates WR-01..08. Only macOS local tests and a windows-msvc cross-check of gamelib-steamfiles ran after the fixes."
  - test: "Confirm the WR-01, WR-02 and WR-07 failure-path behaviour (REVIEW-FIX marks all three 'requires human verification')"
    expected: "A rejected rustInvoke reads as unknown, not 'nothing there'. A skipped sibling ACF yields the '<unknown>' co-install conflict. A truncated manifest is refused by cancelDelete. In each case the shared install dir is kept and no is_installed:false is persisted."
    why_human: "Failure-path decision logic. Jest covers it (160/160 pass across the 5 related suites), but the live UAT only exercised success paths."
  - test: "Record the WR-02 delete-guard change as a divergence in 75-PARITY.md"
    expected: "Four overrides in overrides/library.json (lib1-self-installdir, lib1-no-match, lib1-nonnumeric-shares, with-truncated-manifest) now return '<unknown>'. 75-PARITY.md does not list this, though each override carries a divergenceNote."
    why_human: "The operator-accepted DV list was deliberately not edited by the fixer. Sign-off is an operator decision."
---

# Phase 75: Steam local file formats in Rust: Verification Report

**Phase goal:** Steam's local files are read in Rust, so the ACF format has one implementation.
**Status:** human_needed. All automated checks pass; the three items above remain.
**Re-verification:** No, initial verification.

## Observable truths

| # | Truth (P75 id) | Status | Evidence |
|---|---|---|---|
| 1 | Text VDF/KV1 reading in Rust with typed readers (P75-A) | VERIFIED | `crates/gamelib-steamfiles/src/{kv_text,readers,acf,library}.rs`. Tests `kv_text`, `readers`, `acf_read`, `library` pass. |
| 2 | Binary shortcuts.vdf read and write in Rust, byte-identical round trip (P75-B) | VERIFIED | `kv_bin.rs`, `shortcuts.rs`. `tests/roundtrip.rs::every_fixture_round_trips_byte_for_byte` passes. The CLI has a `roundtrip_is_identical_on_valid_and_never_writes` test. UAT 6 and 7 confirmed 1015 to 1543 to 1015 bytes, `cmp` identical. |
| 3 | Library scan and Steam root discovery in Rust, with a CLI (P75-C) | VERIFIED | `library.rs`, `discover.rs`, `gamelib-steamfiles-cli/src/main.rs`, `tests/cli.rs`. All pass (95, 20, 22 and other tests green). UAT 8: `steamfiles-cli:build` and `bridge-census` exit 0. |
| 4 | One ACF codec, TS ACF writer retired (P75-D) | VERIFIED | `gamelib-depot/src/acf.rs:45` does `pub use gamelib_steamfiles::acf::{..}`. `finalizeAcf.ts` and `appManifest.ts` are deleted and pinned by the gate test. |
| 5 | Two-tier parity with signed-off divergences (P75-E) | VERIFIED | `75-PARITY.md` is APPROVED (operator accepted all, 2026-11-14). The fixtures `expected.json`, `rust-results.json` and `overrides/` are kept. See human item 3 for the one unrecorded WR-02 divergence. |
| 6 | Callers on Rust via rustInvoke, flags flipped, live smoke (P75-F) | VERIFIED | `steamfiles_*` is used by `macSteamAdoption.ts`, `acfInstalledDepots.ts`, `sharedRedists.ts`, `manifestFlags.ts`, `installedMap.ts`, `steamFilesTypes.ts`, `sidecarTransport.ts` and `meta/bridgeCensus.ts`. 75-UAT.md shows 8/8 pass, operator-observed on macOS. |
| 7 | Delete gate: TS readers, both npm packages, flags removed and pinned by a gate test (P75-G) | VERIFIED | `steamFilesPortComplete.test.ts` passes 18/18, including an anti-vacuity check and a package.json check. `@node-steam/vdf` and `steam-shortcut-editor` have 0 hits in package.json and pnpm-lock.yaml. `GAMELIB_STEAMFILES_` is absent from src and meta outside the gate test, which names it by design. |

**Score:** 7/7

## Independent checks run

- `npx jest steamFilesPortComplete.test.ts`: 18/18 pass.
- `cargo test -p gamelib-steamfiles -p gamelib-steamfiles-cli -p gamelib-scan`: all green, no failures.
- jest on `library.acfState`, `cancelDelete`, `macSteamAdoption`, `library.installedMap` and `shortcutsFlows`: 5 suites, 160 tests pass.
- grep for `@node-steam/vdf` and `steam-shortcut-editor`: only in the gate test, as forbidden-string data.

## Requirements coverage

| ID | Status | Notes |
|---|---|---|
| STEAM-03 | SATISFIED | Declared by all 35 plans. REQUIREMENTS.md line 41 is checked and line 88 maps it to Phase 75 as Complete. |
| P75-A to P75-G | SATISFIED | Phase-local, defined in 75-01-PLAN.md and not in REQUIREMENTS.md by design. Each is claimed by plans (A:14, B:7, C:10, D:6, E:19, F:14, G:10) and mapped to truths 1 to 7 above. |

There are no orphaned requirements.

## Anti-patterns

No debt markers were checked exhaustively. The gate test scans the TS tree for forbidden symbols with comments stripped. I found no blockers.

## Deferred and pre-existing items (not attributed to phase 75)

- 10 failing jest suites are pre-existing or from other sessions. dxvkInstallRemove passes 25/25 in isolation.
- Pre-push gate debt comes from other sessions.

## Gaps summary

No gaps. The phase goal is achieved: one Rust ACF codec shared by gamelib-steamfiles and gamelib-depot, TS readers and both npm packages deleted, and a gate test pinning the deletion. Status is `human_needed` only because the post-review-fix commits have not been through CI, the failure-path changes are flagged for human verification, and one WR-02 divergence is not yet recorded in PARITY.

_Verifier: Claude (gsd-verifier)_
