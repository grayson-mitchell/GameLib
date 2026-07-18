---
phase: 24
slug: macos-native-steam-bridge-out-of-process-steam-api-proxy
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-18
---

# Phase 24 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: see `## Validation Architecture` in `24-RESEARCH.md` for the per-requirement validation design this contract is derived from.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing repo config) |
| **Config file** | vitest.config.ts (repo root) |
| **Quick run command** | `yarn test <changed spec>` |
| **Full suite command** | `yarn test` |
| **Estimated runtime** | ~{N} seconds (planner/nyquist auditor to fill) |

---

## Sampling Rate

- **After every task commit:** Run `yarn test <changed spec>`
- **After every plan wave:** Run `yarn test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** {N} seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| {N}-01-01 | 01 | 1 | R{X} | T-24-01 / — | {expected secure behavior or "N/A"} | unit | `{command}` | ✅ / ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Populated by the planner + gsd-nyquist-auditor from the R1–R7 validation design in `24-RESEARCH.md`. Note: R5 (packaged-app dev-HW run), R6 (Avernum 4 / Hoard playable single-player) are human-HW-gated manual verifications (see below).*

---

## Wave 0 Requirements

- [ ] Test stubs for the vtable-generator unit checks (R1: slot order/offsets, `__thiscall`, `ret N`, sret) — automatable without hardware
- [ ] Test stub for helper loopback-only bind + persistent-channel ≥2-request check (R2)
- [ ] Test stub for allowlist routing branch (R4) and non-allowlisted regression (R7)

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Packaged `.app` launches acceptance game via bundled helper | R5 | Requires a packaged build run on the developer's Apple-Silicon Mac | Build the app, launch an allowlisted game, confirm bundled helper is used (no staged binary) |
| Avernum 4 reaches playable single-player via bridge | R6 | Requires real Steam client + game + dev HW | Launch from GameLib; confirm real SteamID64 + persona; no `steam.exe` in bottle |
| Hoard reaches playable single-player via bridge | R6 | Requires real Steam client + game + dev HW | Launch from GameLib; confirm real SteamID64 + persona; no `steam.exe` in bottle |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < {N}s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
