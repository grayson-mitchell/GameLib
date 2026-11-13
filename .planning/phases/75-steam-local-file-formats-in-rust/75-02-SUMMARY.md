---
phase: 75-steam-local-file-formats-in-rust
plan: 02
subsystem: steam-local-files
tags: [fixtures, parity, vdf, shortcuts, gitattributes]
requires: []
provides:
  - Tier 1 synthetic fixture corpus under gamelib-steamfiles/tests/fixtures (acf, libraryfolders, registry, localconfig, valve, installscript, scan, shortcuts)
  - buildShortcutsFixtures() deterministic binary KV builder
affects: [75-03, 75-04, 75-05, 75-06, 75-07, 75-08, 75-09, 75-10, 75-11]
tech-stack:
  added: []
  patterns: [byte-exact fixtures via -text/binary attributes, Jest build-or-assert fixture writer]
key-files:
  created:
    - src-tauri/crates/gamelib-steamfiles/tests/fixtures/README.md
    - src-tauri/crates/gamelib-steamfiles/tests/fixtures/{acf,libraryfolders,registry,localconfig,valve,installscript,scan,shortcuts}/
    - src/backend/storeManagers/steam/localFiles/__tests__/fixtures/buildShortcutsFixtures.ts
    - src/backend/storeManagers/steam/localFiles/__tests__/shortcutsFixtures.test.ts
  modified:
    - .gitattributes
decisions:
  - Fixtures are -text (all) and binary (shortcuts); verified with git ls-files --eol
  - Builder hand-encodes binary KV and never imports steam-shortcut-editor
metrics:
  tasks: 2
  completed: 2026-11-14
---

# Phase 75 Plan 02: Synthetic fixture corpus Summary

A committed, byte-exact synthetic corpus (15 ACF, 4 libraryfolders, 4 registry, 2 localconfig, 9 Valve manifest, 5 installscript, a two-library scan tree, 11 built plus 7 upstream shortcuts files) with a README catalogue and a deterministic in-repo binary shortcuts builder.

## Commits
- 6b551803a: test(75-02) text-VDF corpus, README, .gitattributes
- ab66d41dd: test(75-02) failing test for builder (RED)
- 384c6042f: feat(75-02) builder and shortcuts fixtures (GREEN)

## Deviations from Plan
None to the plan's scope. Note: `pnpm backend-di-ceilings` fails on pre-existing frontend test files (SteamBridgeRouteSummary, SteamUpdateInfo jestMock baselines); none of this plan's files are implicated (out of scope, not fixed).

## Known Stubs
None.

## Self-Check: PASSED
Jest (4 tests, with and without the write env var) green, prettier clean, 48 fixture files all `attr/-text`, CRLF survived, no absolute user paths, empty.vdf bytes match.
