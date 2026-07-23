---
phase: 33
slug: tauri-lifecycle-cluster-app-dialog-window-notifications-tray
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-24
---

# Phase 33 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x |
| **Config file** | jest.config.js |
| **Quick run command** | `{quick command — planner to fill}` |
| **Full suite command** | `{full command — planner to fill}` |
| **Estimated runtime** | ~{N} seconds |

---

## Sampling Rate

- **After every task commit:** Run `{quick run command}`
- **After every plan wave:** Run `{full suite command}`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** {N} seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| {N}-01-01 | 01 | 1 | REQ-{XX} | T-{N}-01 / — | {expected secure behavior or "N/A"} | unit | `{command}` | ✅ / ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `{tests/test_file.ts}` — stubs for REQ-{XX}
- [ ] `{shared fixtures/mocks}`

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

> **D-13 (load-bearing):** G-30-02 install-hang closure MUST have LIVE hardware
> proof under `npm run tauri:dev` before the phase closes — jest was provably
> green while the live build hung TWICE (30-05, 30-07). This bug class only
> exists against a real, stale sidecar CM socket that mocks cannot reproduce.

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| G-30-02 install badge resolves (succeeds or clean error dialog) and never hangs | REQ-{XX} | Only reproducible against a real stale sidecar CM socket; jest green while live hung twice | Under `npm run tauri:dev`, signed-in library, `enableSteamNativeInstall:true`, click Install on a Steam title; badge must resolve — never spin forever |

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
