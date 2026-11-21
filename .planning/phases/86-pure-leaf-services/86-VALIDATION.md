---
phase: "86"
slug: "pure-leaf-services"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-22"
---

# Phase 86 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Seeded from
> `86-RESEARCH.md` § Validation Architecture; the planner fills the per-task map.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Rust `cargo test` (workspace); jest 29.7 (projects `Backend`, `Common`, `Frontend`, `Preload`, `Meta`) |
| **Config file** | `src-tauri/Cargo.toml`, `jest.config.js`, `src/backend/jest.config.js` |
| **Quick run command** | `cd src-tauri && cargo test -p gamelib-info <module>` ; `pnpm exec jest --runTestsByPath <scoped test>` |
| **Full suite command** | `cd src-tauri && cargo test -p gamelib-info -p gamelib-info-cli -p gamelib-store && cargo test --bin gamelib-shell` ; `pnpm codecheck && pnpm lint && pnpm test:ci && pnpm check:ipc-contract && pnpm planning-gates` |
| **Estimated runtime** | ~60 s quick, ~10 min full |

---

## Sampling Rate

- **After every task commit:** the touched `cargo test -p gamelib-info <module>` plus the scoped jest file; `cargo clippy -p gamelib-info --all-targets -- -D warnings`; `cargo fmt -p gamelib-info --check`; `npx prettier --check <exact paths>` after `--file-info` (never `.`).
- **After every plan wave:** the full Rust command plus `pnpm codecheck && pnpm check:ipc-contract`.
- **Before `/gsd-verify-work`:** full suite green on the three-OS CI matrix and the signed-build live gate recorded.
- **Max feedback latency:** 120 seconds per task.

---

## Requirement → Test Map (from research)

| Req / SC | Behavior | Test Type | Automated Command | File Exists |
|----------|----------|-----------|-------------------|-------------|
| SVC-01 / SC1 | Wiki, CrossOver, ITAD, discounts, anticheat, SteamGridDB results equal TS goldens on recorded responses | golden replay | `cargo test -p gamelib-info --test golden_<slice>` | ❌ W0 |
| SVC-01 / SC1 | Same method, URL, decoded query, body, pinned headers as TS (D-10; D-23 TS-only-requests list for GOG) | request pin | `cargo test -p gamelib-info --test requests_<slice>` | ❌ W0 |
| SVC-01 / SC2 | Recent games, overrides and cache stores round-trip existing bytes | file round-trip | `cargo test -p gamelib-info --test roundtrip_<slice>` | ❌ W0 |
| SVC-01 / SC2 | `CacheView` TTL, `invalidateCheck`, dotted `__timestamp` keys, UTC `Date()` write | unit | `cargo test -p gamelib-info cache_view::` | ❌ W0 |
| SVC-01 / SC3 | Zero-test slices get a TS golden harness before Rust (D-11) | oracle | `pnpm exec jest --runTestsByPath src/backend/info/__tests__/infoOracle.test.ts` | ❌ W0 |
| SVC-01 / SC3 | Goldens cannot pass vacuously (manifest floor, empty-input negative) | guard | manifest/floor test in `gamelib-info` | ❌ W0 |
| SVC-01 / SC4 | Per-slice TS, registrations, zod entries gone; shims/resolvers typed-call only (D-06, D-24) | delete gate | `pnpm exec jest --runTestsByPath src/backend/__tests__/infoPortComplete.test.ts src/backend/__tests__/infoShimSchedule.test.ts` | ❌ W0 |
| SVC-01 / SC4 | Native channel args validated, one owner per channel, IPC snapshot regenerated | contract | `pnpm check:ipc-contract` | ✅ extend |
| D-08 | Rust emits `recentGamesChanged`; tray updates | unit + source gate | `cargo test --bin gamelib-shell tray::` | ✅ update |
| D-19/D-26 | No keyring in `-cli`; keys never in fixtures or logs | secrets | `cargo tree -p gamelib-info-cli \| grep -c keyring` == 0; fixture redaction test | ❌ W0 |
| D-12 | Live drift check on demand | opt-in | `cargo run -p gamelib-info-cli -- drift` | ❌ W0 |

---

## Per-Task Verification Map

*Filled by the planner from the PLAN.md `<verify>` blocks.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src-tauri/crates/gamelib-info{,-cli}` scaffold plus the CI/Cargo/README/`cargoFeatures` registration checklist
- [ ] `src/backend/info/__tests__/infoOracle.test.ts` and the recorder (axios adapter set before slice imports; redaction)
- [ ] Recorded fixtures per network slice, then TS goldens; TS golden harnesses for `anticheat`, `recent_games`, `game_overrides` (D-11). No `images_cache` harness (D-22: deleted)
- [ ] State fixtures: v0.10-shaped cache store files, `game-overrides.json`, a `config.json` with populated `games.recent` (from the 85 corpus where possible)
- [ ] `86-HUMAN-UAT.md` (four D-14 items, UAT-shape convention)
- [ ] `infoPortComplete.test.ts`, `infoShimSchedule.test.ts`
- [ ] A shared runner-capabilities JSON with a TS/Rust drift test

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| D-14 live gate on a signed 86 build over a signed 85 build | SVC-01 | Keychain prompts and signing cannot run in CI | `86-HUMAN-UAT.md`, four items |
| D-12 live drift check against real services | SVC-01 | Needs live keys and network; kept out of CI | `cargo run -p gamelib-info-cli -- drift` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
