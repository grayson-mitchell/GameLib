---
phase: 72
slug: renderer-trust-boundary-and-process-hardening
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-08
---

# Phase 72 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from
> `72-RESEARCH.md` § Validation Architecture. No requirement IDs are assigned; rows are keyed by
> CONTEXT.md decision (D-NN).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.7 (ts-jest projects: backend/common/frontend/preload/meta/relay) + `cargo test --bin gamelib-shell` (inline `#[cfg(test)]` modules) |
| **Config file** | `jest.config.js`; `src-tauri/Cargo.toml` |
| **Quick run command** | `pnpm exec jest <path> --silent` ; `cd src-tauri && cargo test --bin gamelib-shell <filter>` |
| **Full suite command** | `pnpm test:ci && pnpm codecheck && pnpm lint && pnpm find-deadcode && pnpm boundaries && pnpm check:ipc-contract && pnpm smoke:sidecar && (cd src-tauri && cargo test --bin gamelib-shell)` |
| **Estimated runtime** | quick ~10–60 s; full ~10 min |

---

## Sampling Rate

- **After every task commit:** the touched test file(s) via the quick command, plus scoped `npx prettier --check <written paths>` (repo convention).
- **After every plan wave:** the full suite command.
- **Before `/gsd-verify-work`:** full suite green + live `pnpm tauri:dev` boot (D-10, react-router 7, i18next-http-backend 4) + macOS UAT (dead-sidecar dialog) + Windows UAT (Job Object).
- **Max feedback latency:** 60 s for the quick command.

---

## Per-Task Verification Map (by decision; planner maps to task IDs)

| Decision | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|----------|-----------------|-----------|-------------------|-------------|--------|
| D-14 | Linux leg compiles the 31+ `cfg(target_os="linux")` sites | CI | `gh run view` on the pushed `rust-test.yml` run | ❌ W0 (workflow edit) | ⬜ pending |
| D-17/18 | audit clean of highs; cargo-deny advisories clean (zip ignores reasoned) | CLI | `pnpm audit --prod --audit-level high`; `cargo deny --manifest-path src-tauri/Cargo.toml check advisories` | ❌ W0 (`deny.toml`) | ⬜ pending |
| D-19 | react-router 7 + i18next-http-backend 4 still route and load locales | jest + live | `pnpm exec jest src/frontend`; live boot | ✅ | ⬜ pending |
| D-06/07/08 (TS) | URL scheme allow-list, folder = absolute existing dir, files revealed | jest | `pnpm exec jest src/backend/sidecar/__tests__/openPolicy.test.ts` | ❌ W0 | ⬜ pending |
| D-06 (Rust) | Rust policy authoritative, rejects same inputs | cargo | `cargo test --bin gamelib-shell shell_open` | ❌ W0 | ⬜ pending |
| D-06 parity | both layers read one fixture file | jest + cargo | both above read `openPolicyCases.json` | ❌ W0 | ⬜ pending |
| D-09 (amended) | renderer `removeFolder` channel gone; helper async, no timer | jest + CLI | `pnpm exec jest downloadqueue shellFiles` + `pnpm check:ipc-contract` | ✅ update | ⬜ pending |
| D-10 | capabilities pinned; opener JS-link injection off; renderer link handler | jest + live | `pnpm exec jest src/backend/__tests__/capabilitiesDefault.test.ts`; `pnpm tauri:dev` | ✅ update | ⬜ pending |
| D-11 | 14 handlers deleted; shortcuts tests repointed | jest + knip | `pnpm exec jest src/backend/shortcuts`; `pnpm find-deadcode` | ✅ update | ⬜ pending |
| D-12 | token store fail-closed before bootstrap | jest | `pnpm exec jest src/backend/storeManagers/steam/__tests__/tokenStore.test.ts` | ✅ rewrite | ⬜ pending |
| D-13 | kills by tracked PID/group; `killPattern` gone | jest | `pnpm exec jest src/backend/__tests__/trackedChildren.test.ts` (fake HOME) | ❌ W0 | ⬜ pending |
| D-04 | fatal `uncaughtException`, bounded unref'd flush | jest | `pnpm exec jest src/backend/sidecar/__tests__/sidecarRejectionGuard.test.ts` | ✅ extend | ⬜ pending |
| D-01/03 | dialog on death; none on quit/relaunch | cargo + UAT | `cargo test --bin gamelib-shell on_sidecar_eof` | ❌ W0 | ⬜ pending |
| D-20 | Job Object compiles on Windows | CI compile | windows leg of `rust-test.yml` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/common/__fixtures__/openPolicyCases.json` + `src/backend/sidecar/__tests__/openPolicy.test.ts`
- [ ] `src-tauri/src/shell_open.rs` with `#[cfg(test)]` parity tests
- [ ] `src/backend/__tests__/trackedChildren.test.ts` (fake-HOME isolation)
- [ ] `on_sidecar_eof` / shutdown-flag Rust tests
- [ ] `src-tauri/deny.toml`, `.github/dependabot.yml`, `72-UAT.md`
- [ ] shared `setTokenStore(fakeStore)` test helper for Steam suites

---

## Manual-Only Verifications

| Behavior | Decision | Why Manual | Test Instructions |
|----------|----------|------------|-------------------|
| Dead-sidecar dialog appears; normal quit shows none | D-01/D-03 | native dialog, real process death | `pnpm tauri:dev`; `kill -9` the sidecar → dialog with Restart/Quit; relaunch; Cmd+Q → no dialog |
| App boots after capability trim; changelog links open externally | D-10 | plugin init scripts need grants only at runtime | `pnpm tauri:dev`; no ACL errors in console; click a changelog link |
| No CLI/game child survives quit on Windows | D-20 | Windows-only, Task Manager | operator's Windows PC: launch, start legendary/gogdl op, quit, check Task Manager |
| Dependabot security updates enabled | D-17 | repo admin setting | GitHub → Settings → Code security → enable Dependabot security updates |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
