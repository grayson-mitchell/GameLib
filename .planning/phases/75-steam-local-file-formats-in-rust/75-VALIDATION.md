---
phase: 75
slug: steam-local-file-formats-in-rust
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-13
---

# Phase 75 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | cargo test (Rust crates) + Jest (TS callers, parity, delete-gate tests) |
| **Config file** | `src-tauri/Cargo.toml` workspace; Jest config in repo root |
| **Quick run command** | `cd src-tauri && cargo test -p gamelib-steamfiles -p gamelib-steamfiles-cli` |
| **Full suite command** | `cd src-tauri && cargo test -p gamelib-scan -p gamelib-scan-cli -p gamelib-depot -p gamelib-depot-cli -p gamelib-steamfiles -p gamelib-steamfiles-cli` plus `pnpm jest src/backend/storeManagers/steam src/backend/shortcuts` |
| **Estimated runtime** | ~180 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cargo test -p gamelib-steamfiles` plus the touched Jest file
- **After every plan wave:** Run the full suite command, `cargo clippy --workspace` (shrink-only ratchet), `pnpm tsc`
- **Before `/gsd-verify-work`:** Full suite green on all CI legs + parity sweep clean + live UAT
- **Max feedback latency:** 180 seconds

---

## Per-Task Verification Map

Filled by the planner/executor from each plan's `<verify>` blocks. Requirement → test map (from 75-RESEARCH.md):

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| STEAM-03 | Text KV parse + views, quirks pinned | unit/golden | `cargo test -p gamelib-steamfiles --test golden` | ❌ W0 | ⬜ pending |
| STEAM-03 | Typed ACF/libraryfolders/registry readers == TS oracle | Jest parity | `pnpm jest steamFilesParity` | ❌ W0 | ⬜ pending |
| STEAM-03 | shortcuts.vdf byte-identical round-trip + atomic write + edit parity | unit | `cargo test -p gamelib-steamfiles --test roundtrip` | ❌ W0 | ⬜ pending |
| STEAM-03 | Discovery decision logic per OS (fake probe) | unit | `cargo test -p gamelib-steamfiles discover` | ❌ W0 | ⬜ pending |
| STEAM-03 | OPS == channel constants == match arms | static Jest | `pnpm jest steamFilesChannelParity` | ❌ W0 | ⬜ pending |
| STEAM-03 | Shared ACF builder: depot goldens unchanged | unit | `cargo test -p gamelib-depot --test acf --test golden` | ✅ | ⬜ pending |
| STEAM-03 | finalize rules through Rust | Jest/cargo | `pnpm jest depotRust` | partial | ⬜ pending |
| STEAM-03 | Delete gate (paths gone, symbols absent, walk >= 500 files) | Jest | `pnpm jest steamFilesPortComplete` | ❌ W0 | ⬜ pending |
| STEAM-03 | Local sweep over real files, zero unexplained diffs | script | `pnpm steamfiles-parity-sweep` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `gamelib-steamfiles` and `-cli` crates, fixtures (ACF quirks, Windows libraryfolders, registry.vdf, installscript duplicates, valve manifest, shortcuts.vdf variants), `golden.rs`, `roundtrip.rs`
- [ ] TS oracle capture generator, run BEFORE deleting `@node-steam/vdf` / `steam-shortcut-editor` / `parseKv1`, committing `expected.json`
- [ ] Stub replacing `jest.mock('@node-steam/vdf')` in Jest callers
- [ ] `rust-test.yml` `-p` entries (test + CLI build), `EXPECTED_LOCKFILE_CRATE_NAMES`, `steamfiles-cli:build` prefixed into `bridge-census`, knip entries

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live macOS smoke: refresh, install poll, uninstall detect, running poll, add-to-Steam | STEAM-03 | Needs a real Steam install and running app | `pnpm tauri:dev`; each UAT item names the log line proving the Rust path |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
