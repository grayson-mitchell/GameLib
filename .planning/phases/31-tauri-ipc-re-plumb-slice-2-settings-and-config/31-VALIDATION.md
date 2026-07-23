---
phase: 31
slug: tauri-ipc-re-plumb-slice-2-settings-and-config
status: populated
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-23
---

# Phase 31 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (ts-jest) |
| **Config file** | `jest.config.js` (existing) |
| **Quick run command** | `npx jest src/backend/sidecar/__tests__/settingsFlows.test.ts` |
| **Full suite command** | `npx jest src/backend/sidecar/__tests__` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest src/backend/sidecar/__tests__/settingsFlows.test.ts`
- **After every plan wave:** Run `npx jest src/backend/sidecar/__tests__`
- **Before `/gsd:verify-work`:** Full sidecar suite must be green + both builds boot (`npm start`, `npm run tauri:dev`)
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

> Planner populates this table — one row per task, mapping to REQ-31-01..07 and any T-31-xx threat refs.
> See 31-RESEARCH.md "## Validation Architecture" for the assertion shapes (channel wiring,
> settings write→read round-trip, dialog forward-to-transport, additive/reversible guard).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 31-01-01 | 01 | 1 | REQ-31-01, REQ-31-02 | T-31-01, T-31-02 | Write path confined to config domain (GlobalConfig/GameConfig.setSetting); never routes TOKEN_STORE_KEY into configStore; type-guards non-string appName/key before raw per-game write | unit | `npx jest src/backend/sidecar/__tests__/settingsFlows.test.ts` | ✅ extend | ⬜ pending |
| 31-01-02 | 01 | 1 | REQ-31-01, REQ-31-07 | — | Six generic reads resolve real values; getUserInfo/readConfig stay non-fatally rejecting (Invariant B) | unit | `npx jest src/backend/sidecar/__tests__/settingsFlows.test.ts` | ✅ extend | ⬜ pending |
| 31-01-03 | 01 | 1 | REQ-31-02 | — | Global writeConfig persists through existing configStore allow-list; no new store declaration | unit | `npx jest src/backend/sidecar/__tests__/storeLayer.test.ts` | ✅ extend | ⬜ pending |
| 31-02-01 | 02 | 1 | REQ-31-03 | T-31-04 | Two RUST_DIALOG_* channels added only to the existing rustInvoke allowlist; Rust arms compile; no new capability | build | `cargo check --manifest-path src-tauri/Cargo.toml` | ✅ existing | ⬜ pending |
| 31-02-02 | 02 | 1 | REQ-31-03, REQ-31-04 | T-31-03 | Async dialog members forward to Rust and map results with safe-default catch (never throw); showSaveDialog path is user-chosen; Sync pair + shell/clipboard stay logged no-ops | unit | `npx jest src/backend/sidecar/__tests__/dialogStub.test.ts` | ✅ extend | ⬜ pending |
| 31-03-01 | 03 | 2 | REQ-31-06 | T-31-05 | Declared ported-channel list; claim scoped to wired/unit-proven not hardware-proven | doc | `grep -q showMessageBox .planning/phases/31-tauri-ipc-re-plumb-slice-2-settings-and-config/31-PORTED-CHANNELS.md` | ❌ W0 (new doc) | ⬜ pending |
| 31-03-02 | 03 | 2 | REQ-31-02, REQ-31-05, REQ-31-07 | T-31-05 | SEAM reconciled; D-02 divergence recorded; deferred UAT logged; Invariants A/B unchanged | doc | `grep -q 31-PORTED-CHANNELS .planning/phases/27-tauri-shell-walking-skeleton/SEAM.md` | ✅ existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/backend/sidecar/__tests__/settingsFlows.test.ts` — **already exists** (Phase 30); extend for write path + dialog members
- [ ] `src/backend/sidecar/__tests__/storeLayer.test.ts` — **already exists** (Phase 29); write path persists through it
- [ ] `src/backend/sidecar/__tests__/electronUntouched.test.ts` — **already exists**; additive/reversible guard

*Existing infrastructure covers all phase requirements — no new framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live settings change persists + Settings screen reflects it under `npm run tauri:dev` | REQ-31-01, REQ-31-02 | Deferred UAT (D-05) — phase claim is "wired and unit-proven", not "hardware-proven" | Log as deferred UAT item; run Tauri build, change a setting, confirm persistence + local reflect |
| Real `showMessageBox`/`showErrorBox`/`showSaveDialog` render native dialogs under Tauri | REQ-31-03 | No ported settings flow reaches these members (31-RESEARCH.md Q2) — infra-only, no E2E driver | Log as deferred UAT; verify via direct unit test against `electronStub.dialog.*`, live check optional |

*Automated coverage proves the wiring; live UAT is deferred per D-05.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
