---
phase: "82"
slug: "guardrails-hygiene-and-shared-safety-primitives"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-20"
---

# Phase 82 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29 (ts-jest, 6 projects) + cargo test (rustc 1.99.1) |
| **Config file** | jest.config.js, src/backend/jest.config.js, meta/jest.config.js, src-tauri/Cargo.toml |
| **Quick run command** | `npx jest --runTestsByPath <files>` / `cd src-tauri && cargo test -p gamelib-safety` |
| **Full suite command** | `pnpm test` + D-01 ratchet gates (`backend-di-ceilings`, `steam-line-ceiling`, `gameinfo-narrowing-ceiling`, `find-deadcode`, `lint`, `i18n --fail-on-update`, `planning-gates`) |
| **Estimated runtime** | ~82 seconds |

---

## Sampling Rate

- **After every task commit:** Run the task's own `npx jest --runTestsByPath` set (+ `cargo test -p gamelib-safety` when Rust changed)
- **After every plan wave:** Run `pnpm test` + the D-01 ratchet gates + `pnpm codecheck` + `pnpm check:ipc-contract`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 82 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (filled from PLAN.md tasks) | | | FND-01 / FND-02 | | | | | | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src-tauri/crates/gamelib-safety/{src,tests/adversarial.rs}` and the Rust `FakeHome` helper — FND-02
- [ ] `src/backend/safety/` TS adapter + `__tests__/{safetyChannelParity,guards}.test.ts` — FND-02
- [ ] `src/backend/__tests__/destructivePathGate.test.ts` — FND-02
- [ ] `src/backend/testUtils/censusFloor.ts` + empty-input cases in the census tests — FND-01
- [ ] Frontend refusal notice component + tests — FND-02
- [ ] `82-TEST-LEDGER.md`, `82-UTILS-BOOTSTRAP-INVENTORY.md`, `82-STATE-OWNERSHIP.md` — FND-01 / criterion 5
- No framework install needed.

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Three-OS adversarial delete table | FND-02 | No local Windows/Linux machine; proof is the CI matrix (D-18) | `gh run list --workflow rust-test.yml` green on windows/macos/ubuntu legs at the proof sha |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 82s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
