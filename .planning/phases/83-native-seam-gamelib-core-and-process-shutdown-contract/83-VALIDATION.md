---
phase: "83"
slug: "native-seam-gamelib-core-and-process-shutdown-contract"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-20"
---

# Phase 83 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Seeded from `83-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `cargo test` (Rust 1.99.1) for crates and shell; jest 29.7 for gates and generator |
| **Config file** | `src-tauri/Cargo.toml` workspace; jest projects (Meta, Backend, Preload, Frontend); `.github/workflows/rust-test.yml` |
| **Quick run command** | `cd src-tauri && cargo test -p gamelib-core -p gamelib-proc` (crate work) or the touched jest census file |
| **Full suite command** | `cd src-tauri && cargo test --bin gamelib-shell && cargo test -p gamelib-core -p gamelib-proc -p gamelib-steampoll -p gamelib-steampoll-cli`, plus `pnpm check:ipc-contract`, `pnpm codecheck` and the census jest files |
| **Estimated runtime** | ~180 seconds (full); ~30 seconds (quick) |

---

## Sampling Rate

- **After every task commit:** the quick command for the touched area, plus `npx prettier --check` on exactly the paths written (convention 5; check `--file-info` first)
- **After every plan wave:** the full suite command
- **Before `/gsd-verify-work`:** three-leg `rust-test.yml` green, then the live macOS gate
- **Max feedback latency:** 180 seconds

---

## Per-Task Verification Map

Filled by the planner per task. Requirement-level map from research:

| Req | Behavior | Test Type | Automated Command | File Exists | Status |
|-----|----------|-----------|-------------------|-------------|--------|
| FND-03 | Router table == generated native sets ⊂ `RENDERER_CHANNELS`; no two-owner channel; zero-owner ledger exact | unit + census | `cargo test --bin gamelib-shell native_router`; `pnpm jest --runTestsByPath src/backend/sidecar/__tests__/ipcDomainCensus.test.ts` | ❌ W0 | ⬜ pending |
| FND-03 | Each native channel has ≥1 `invalid` vector and every vector behaves | unit (data-driven) | `cargo test --bin gamelib-shell native_manifest_vectors` | ❌ W0 | ⬜ pending |
| FND-03 | Native rejection text carries the INVALID_ARGS / INVALID_CHANNEL marker; send rejection logs name only | unit | `cargo test --bin gamelib-shell native_rejection_shape` | ❌ W0 | ⬜ pending |
| FND-03 | Schema snapshot fresh; floor + empty + truncated inputs fail | generator jest + CI | `pnpm check:ipc-contract`; `pnpm jest meta/__tests__/genIpcContract` | partial | ⬜ pending |
| FND-03 | Slice queue FIFO, non-blocking enqueue, survives a failed job | unit | `cargo test --bin gamelib-shell native_send_queue` | ❌ W0 | ⬜ pending |
| FND-03 | Proof-channel TS deleted (`*PortComplete`) | jest source gate | `pnpm jest --runTestsByPath src/backend/__tests__/nativeSeamPortComplete.test.ts` | ❌ W0 | ⬜ pending |
| FND-04 | Graceful quit: helpers gone, stand-in game tree alive | integration | `cargo test -p gamelib-proc --test orphans graceful` | ❌ W0 | ⬜ pending |
| FND-04 | SIGKILL of parent: helpers + grandchildren gone, game alive; reaper-disabled negative control | integration | `cargo test -p gamelib-proc --test orphans sigkill` | ❌ W0 | ⬜ pending |
| FND-04 | Node stand-in sidecar: non-detached children die | integration (panics on CI if node missing) | `cargo test -p gamelib-proc --test orphans node_standin` | ❌ W0 | ⬜ pending |
| FND-04 | `Shutdown::begin` returns by the deadline and names stragglers | unit | `cargo test -p gamelib-core shutdown` | ❌ W0 | ⬜ pending |
| FND-04 | Steampoll green after the `ProcessRunner` hoist | unit | `cargo test -p gamelib-steampoll -p gamelib-steampoll-cli` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Live macOS gate contract authored before any code, with the Structural Reachability Review recorded
- [ ] `crates/gamelib-core` and `crates/gamelib-proc` skeletons, workspace members, `EXPECTED_LOCKFILE_CRATE_NAMES` +2, `rust-test.yml` `-p` entries (orphan harness in its own early step)
- [ ] `src/common/types/ipc/nativeChannels.json`, `native.ts`, generator extension with floor and empty/truncated tests
- [ ] `nativeSeamPortComplete.test.ts` skeleton and census updates (re-measure after Phase 82 lands)
- [ ] `crates/README.md` additions, CLAUDE.md Conventions row and `gamelib-conventions` skill section (D-14)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Force Quit during a download with a game running leaves no helper, game survives | FND-04 | The 80 nettop orphan was only found on the real app; CI stand-ins cannot reproduce the full live helper set | `pnpm tauri:dev`; start a Steam download; launch a game via `steam://` or a Rust-spawned stand-in (D-15, not a TS-launched Wine game); record `ps -axo pid,ppid,pgid,comm`; Force Quit; within 5 s `ps` shows no sidecar, nettop, reaper, comet, legendary/gogdl/nile or wine tools, and the game is still present; no Dock icon for the reaper; no `[shell] reaper unavailable` in the diag log |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
