---
phase: "94"
slug: "humble-bundle-and-shortcuts"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-24"
---

# Phase 94 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Seeded from `94-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7 (TS) and `cargo test` (Rust 1.99.1) |
| **Config file** | `jest.config.js`, `src/backend/jest.config.js`, `src/backend/jest.setupContainment.ts` (fake-HOME containment) |
| **Quick run command** | `pnpm exec jest --runTestsByPath <file>`; `cd src-tauri && cargo test -p gamelib-humble` / `cargo test -p gamelib-shortcuts` |
| **Full suite command** | `pnpm test:ci`; `cd src-tauri && cargo test -p gamelib-safety -p gamelib-testutil && cargo test -p gamelib-proc && cargo test -p gamelib-humble -p gamelib-shortcuts -p gamelib-steamfiles -p gamelib-info -p gamelib-i18n -p gamelib-core -p gamelib-store && cargo test --bin gamelib-shell`; `pnpm check:ipc-contract`; `pnpm codecheck`; `pnpm planning-gates` |
| **Estimated runtime** | ~600 seconds (full); ~60 seconds (quick, per crate) |

---

## Sampling Rate

- **After every task commit:** the task's crate tests, plus `npx prettier --check` over the exact written paths (check `--file-info` first; `.planning` and `public/locales` are prettier-ignored, so omit the check there)
- **After every plan wave:** rebase on main, `pnpm gen:ipc-contract` then `pnpm check:ipc-contract`, the full suite above on macOS, push for the three-OS CI legs
- **Before `/gsd-verify-work`:** full suite green, three-OS CI green, and the signed-over-signed live gate (D-10)
- **Max feedback latency:** 60 seconds (per-task crate tests)

---

## Per-Task Verification Map

Filled in by the planner and executor. Requirement → test map from research:

| Req | Behavior | Test Type | Automated Command | Plan | File Exists | Status |
|-----|----------|-----------|-------------------|------|-------------|--------|
| SVC-04 | classify/dedup/title-match/alerts/app-id resolver port | Rust unit | `cargo test -p gamelib-humble` | 94-12, 94-15, 94-17, 94-25 | ❌ W0 | ⬜ pending |
| SVC-04 | sync/reveal/mark/undo/overrides/gift/audit golden replay | Rust golden + Jest oracle | `cargo test -p gamelib-humble --test golden_library` | 94-08, 94-23, 94-25, 94-26 | ❌ W0 | ⬜ pending |
| SVC-04 | request pinning (URL/method/headers/multipart order/no-redirect) | Rust replay | `cargo test -p gamelib-humble --test http_replay` | 94-08, 94-15, 94-23 | ❌ W0 | ⬜ pending |
| SVC-04 | state files round-trip, legacy backfill, corrupt copy-aside | Rust golden | `cargo test -p gamelib-humble --test state_roundtrip` | 94-19 | ❌ W0 | ⬜ pending |
| SVC-04 | secrets: cache, memo, invalidate-before-delete, no value in logs | Rust unit | `cargo test -p gamelib-humble secrets` | 94-21 | ❌ W0 | ⬜ pending |
| SVC-04 | shell wiring: native channel vectors, ownership | Rust + Jest | `cargo test --bin gamelib-shell`; sidecar census Jest tests | 94-13, 94-28, 94-29 | ✅ | ⬜ pending |
| SVC-04 | digest strings equal i18next | Rust + Jest | `cargo test -p gamelib-i18n`; `i18nGolden.test.ts` | 94-17 | ✅ extend | ⬜ pending |
| SVC-05 | `run.sh`/`Info.plist`/`.desktop` byte-identical incl. hostile names | Rust golden | `cargo test -p gamelib-shortcuts --test golden_text` | 94-05, 94-14 | ❌ W0 | ⬜ pending |
| SVC-05 | icns decodable; iconless omits `CFBundleIconFile` | Rust test | `cargo test -p gamelib-shortcuts icns` | 94-14 | ❌ W0 | ⬜ pending |
| SVC-05 | `.lnk` argv/env/stdin/timeout; reg query; icon chain | Rust golden | `cargo test -p gamelib-shortcuts --test golden_windows` | 94-07, 94-16 | ❌ W0 | ⬜ pending |
| SVC-05 | removal proof / refuse on unknown | Rust test (FakeHome) | `cargo test -p gamelib-shortcuts remove` | 94-18 | ❌ W0 | ⬜ pending |
| SVC-05 | add/remove to Steam: ids, entry fields, atomic vdf, grid art | Rust golden | `cargo test -p gamelib-shortcuts --test golden_steam` | 94-20 | ❌ W0 | ⬜ pending |
| both | shim schedule, deletion gates and survivor list | Jest | `humbleShortcutsShimSchedule.test.ts`, `humblePortComplete.test.ts`, `shortcutsPortComplete.test.ts` | 94-03, 94-11, 94-22, 94-24, 94-30, 94-31 | ❌ new / ✅ amend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] TS golden harness for Humble (fake-HOME) emitting goldens; wire-level recorder and one operator-redacted real capture (redaction check as a permanent test)
- [ ] TS golden harness for shortcuts: per-OS text outputs, hostile names, `sanitize` vectors, icon chain, `.lnk` env/stdin, Steam entry/ids; sips icon geometry vectors
- [ ] `gamelib-humble` and `gamelib-shortcuts` crate scaffolds; `Cargo.lock` names in `cargoFeatures.test.ts`; `rust-test.yml` `-p` entries
- [ ] Vacuous-pass guards on every golden (fixture-count floor; empty input fails)
- [ ] `gamelib-proc` hide-window flag; `genI18nGolden.ts` cases for Humble and shortcut keys
- [ ] Live gate file authored before code (D-23), with Structural Reachability Review

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Humble sync/claim/redeem against the real service, no new Keychain prompt | SVC-04 | Real account, Cloudflare/TLS behaviour, Keychain prompts are only observable live | Signed-over-signed live gate (D-08/D-09/D-10) |
| Shortcuts appear and launch on macOS, Windows, Linux desktops | SVC-05 | Desktop/Finder/Start-menu rendering is OS UI | Live gate per OS |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
