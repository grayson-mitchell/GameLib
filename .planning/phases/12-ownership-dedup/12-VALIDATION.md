---
phase: 12
slug: ownership-dedup
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-06
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing project test runner) |
| **Config file** | vitest config in repo root |
| **Quick run command** | `pnpm test -- --run <changed-area>` |
| **Full suite command** | `pnpm test -- --run` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test -- --run <changed-area>`
- **After every plan wave:** Run `pnpm test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (filled by planner) | — | — | HDEDUP-01, HDEDUP-02 | — | — | unit | — | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Test stubs for ownership-matching module (AppID exact match, fuzzy fallback, DLC guard) — HDEDUP-01
- [ ] Test stubs for redeemed-key annotation mapping — HDEDUP-02

*Planner to finalize based on plan/task breakdown.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Annotation renders on Steam GamePage entry | HDEDUP-02 | Visual UI verification in running Electron app | Launch app, open a Steam game with a redeemed Humble key, confirm annotation |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
