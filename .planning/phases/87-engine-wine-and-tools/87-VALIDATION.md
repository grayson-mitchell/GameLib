---
phase: "87"
slug: "engine-wine-and-tools"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-23"
---

# Phase 87 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Seeded from
> `87-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7 (TS goldens, shims, gates) + `cargo test` (Rust goldens, units) |
| **Config file** | `src/backend/jest.config.js`; Rust per crate (`src-tauri/crates/gamelib-engine/`, `src-tauri/crates/gamelib-wine/`) |
| **Quick run command** | `pnpm jest src/backend/engine src/backend/tools src/backend/wine --silent` ; `cd src-tauri && cargo test -p gamelib-engine -p gamelib-wine` |
| **Full suite command** | `pnpm test:ci` ; `cd src-tauri && cargo test -p gamelib-safety -p gamelib-testutil -p gamelib-proc -p gamelib-engine -p gamelib-engine-cli -p gamelib-wine -p gamelib-wine-cli && cargo test --bin gamelib-shell` ; `pnpm check:ipc-contract` ; `pnpm planning-gates` |
| **Estimated runtime** | ~300 seconds (full); ~60 seconds (quick) |

---

## Sampling Rate

- **After every task commit:** the touched crate's `cargo test -p <crate>` plus the touched Jest folder, and `npx prettier --check` over the exact written paths (`--file-info` first; omit over prettier-ignored paths such as `.planning`)
- **After every plan wave:** full Rust set above, `pnpm test:ci`, `pnpm codecheck`, `pnpm lint`
- **Before `/gsd-verify-work`:** full suite green, three-OS CI green, then `87-UAT.md` run on the signed Phase 87 build installed over a signed Phase 86 build (D-12)
- **Max feedback latency:** 300 seconds

---

## Per-Task Verification Map

| Req / SC | Behavior | Test Type | Automated Command | File Exists | Status |
|----------|----------|-----------|-------------------|-------------|--------|
| SVC-02 / SC1 | decision matrix, CrossOver-first, fallback to pin | Rust golden replay | `cargo test -p gamelib-engine --test golden_decision` | ❌ W0 | ⬜ pending |
| SVC-02 / SC1 | launch step, deadline, process watch | Rust unit + golden | `cargo test -p gamelib-engine --test golden_launch` | ❌ W0 | ⬜ pending |
| SVC-02 / SC1 | fallback download/verify/extract + events | Rust replay | `cargo test -p gamelib-engine --test golden_fallback` | ❌ W0 | ⬜ pending |
| SVC-02 / SC1 | live healthy/fallback/adopt, expired trial | live gate (operator, signed build) | `87-UAT.md` items 1–2 | ❌ W0 (authored before coding) | ⬜ pending |
| SVC-02 / SC2 | bottle create/reuse/remove, sibling-safe, markers byte-equal, newer marker kept | Rust golden + safety table | `cargo test -p gamelib-engine --test golden_bottles` | ❌ W0 | ⬜ pending |
| SVC-02 / SC2 | TS pure-helper twin == Rust vectors (D-24) | Jest + Rust shared JSON | `pnpm jest src/backend/engine/__tests__/bottlePathsVectors.test.ts` | ❌ W0 | ⬜ pending |
| SVC-02 / SC3 | wine core, discovery, wine-manager, runtimes, winetricks, DXVK/DXMT/vkd3d goldens | Rust golden replay | `cargo test -p gamelib-wine` | ❌ W0 | ⬜ pending |
| SVC-02 / SC3 | live tools and downloads | live gate item 4 | `87-UAT.md` | ❌ W0 | ⬜ pending |
| SVC-02 / SC4 | TS and registrations deleted; only scheduled shims/resolvers/twin remain | Jest gate | `pnpm jest src/backend/__tests__/engineWinePortComplete.test.ts src/backend/__tests__/engineWineShimSchedule.test.ts` | ❌ W0 | ⬜ pending |
| FND-04 | no orphan winetricks/tar/wine helper after quit | `gamelib-proc` orphan harness arm | `cargo test -p gamelib-proc` | extend | ⬜ pending |
| FND-06 | markers/notices/wine-downloader-info round trip, newer never overwritten, corrupt kept | Rust golden | `cargo test -p gamelib-engine --test roundtrip_state` | ❌ W0 | ⬜ pending |
| D-14 | channel parity (OPS == constants == arms), IPC snapshot | Jest + gen | `pnpm check:ipc-contract` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/backend/__tests__/engineWinePortComplete.test.ts`, `engineWineShimSchedule.test.ts` (copy `infoPortComplete` / `infoShimSchedule`, with planted-fixture detector self-tests and walk floors)
- [ ] TS golden harness: spawn-trace and tree recorders, `MANIFEST.json` floors, `assertAtOrAboveFloor` (82 D-05 vacuous-pass guards)
- [ ] `tests/fixtures/{recorded,golden,state}/<slice>/` in both crates, with a redaction test
- [ ] `ProcSpec` runner (env, cwd, stdin, abort, streaming) in `gamelib-core` / `gamelib-proc`, with its orphan arm
- [ ] cross-language vector file for the bottle-path twin (D-24)
- [ ] `87-UAT.md` (inline `expected:`, `result:` opens with a status word) with the Structural Reachability table

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CrossOver healthy → no-CrossOver fallback → re-adopt, incl. a D3D11 title and a bridge Steam title | SVC-02 / SC1 | real CrossOver, wineserver timing, CrossOver adopting a fallback bottle | `87-UAT.md` item 1 (`no-crossover.sb`) |
| Expired trial routes to Staging; ≤7-day notice | SVC-02 / SC1 | trial licence read from the real HOME | `87-UAT.md` item 2 (`nolicence.sb`, `backdate.py`, operator approval) |
| Bottle reuse and sibling-safe removal on real bottles | SVC-02 / SC2 | real bottles written by a signed 86 build | `87-UAT.md` item 3 |
| Winetricks verb, DXVK/DXMT install/remove, wine-manager download with progress | SVC-02 / SC3 | real network, real winetricks | `87-UAT.md` item 4 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 300s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
