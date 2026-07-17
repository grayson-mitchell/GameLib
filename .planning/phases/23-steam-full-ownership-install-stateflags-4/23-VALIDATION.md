---
phase: 23
slug: steam-full-ownership-install-stateflags-4
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-17
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing — Steam depot suite ran 72/72 + 58/58 green at spike time) |
| **Config file** | existing repo vitest config (Steam backend suite) |
| **Quick run command** | `yarn vitest run src/backend/storeManagers/steam/depot` |
| **Full suite command** | `yarn vitest run src/backend/storeManagers/steam` |
| **Estimated runtime** | ~30–60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `yarn vitest run src/backend/storeManagers/steam/depot`
- **After every plan wave:** Run `yarn vitest run src/backend/storeManagers/steam`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

> Requirement IDs (REQ-23-XX) are minted by the planner from decisions D-01..D-07. Rows below are the validation skeleton the planner must populate per task.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 23-01-01 | 01 | 1 | REQ-23-02 (buildid threading) | — | Manifest `buildid` equals downloaded public-branch buildid, never `"0"` when writing StateFlags=4 | unit | `yarn vitest run src/backend/storeManagers/steam/depot` | ❌ W0 | ⬜ pending |
| 23-02-01 | 02 | 1 | REQ-23-01 (4-vs-1026 gate) | — | Completeness predicate returns 4 only when every chunk sha1-verified + all file modes applied; else 1026 | unit | `yarn vitest run src/backend/storeManagers/steam/depot` | ❌ W0 | ⬜ pending |
| 23-03-01 | 03 | 1 | REQ-23-06 (file-mode fidelity) | — | Executable(32)/CustomExecutable(128) → +x applied; ReadOnly(8)/Hidden(16) applied; Windows attribs via attrib.exe | unit | `yarn vitest run src/backend/storeManagers/steam/depot` | ❌ W0 | ⬜ pending |
| 23-04-01 | 04 | 2 | REQ-23-04 (resume/reconciliation) | — | Interrupted download re-verifies all chunks + re-applies modes before writing 4; no silent Steam-in-CrossOver auto-open | unit | `yarn vitest run src/backend/storeManagers/steam/depot` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Unit test coverage for the completeness predicate (4-vs-1026 gate) — pure function, deterministic, fully automatable
- [ ] Unit test coverage for buildid threading through `buildDepotPlan` → `finalizeToSteam` → `writeAppManifest` (assert non-`"0"` buildid propagates)
- [ ] Unit test coverage for `EDepotFileFlag` → filesystem-mode mapping (bitflag → chmod/attrib decisions), including the load-bearing exec bit
- [ ] Unit/integration coverage for resume reconciliation: partial-state detection → re-selection → re-verify → complete-or-fallback
- [ ] Existing default-off/1026 tests remain green (byte-identical fallback behavior is the safety net — must not regress)

*Existing vitest infrastructure covers the framework; new specs are additive.*

---

## Manual-Only Verifications

> These are the D-07 pre-ship real-hardware gates. They cannot be automated (require a live Steam client + real depots) and block phase completion.

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Multi-depot larger title installs under StateFlags=4 across depots with no verify/re-download | REQ-23-07 (D-07.1) | Requires real Steam client + multi-depot title (Cyberpunk, pending Phase 21 D-UAT-08) | Install via GameLib native path on macOS; confirm Steam shows Ready, no verify pass, no re-download; launch succeeds |
| Confirmed hard-DRM title launches under StateFlags=4 | REQ-23-07 (D-07.2) | Closes spike-001's open DRM caveat; needs a real DRM title + Steam | Install a hard-DRM title; launch via `steam://`; confirm launch with no re-validation |
| Interrupt-then-resume run yields Steam-trusted 4 + launch, no re-download | REQ-23-07 (D-07.3) + D-04 | Requires killing Steam/GameLib mid-download on real HW | Start install, kill mid-download, resume; confirm reconciled StateFlags=4, launch, no re-download; confirm no silent Steam-in-CrossOver auto-open |

*Prove on macOS first (where spikes ran); Windows/Linux OS coverage is a deferred follow-up (D-07), not a Phase 23 gate.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
