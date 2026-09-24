---
phase: 19
slug: crossover-compatibility-index-macos
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-12
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | {pytest 7.x / jest 29.x / vitest / go test / other} |
| **Config file** | {path or "none — Wave 0 installs"} |
| **Quick run command** | `{quick command}` |
| **Full suite command** | `{full command}` |
| **Estimated runtime** | ~19 seconds |

---

## Sampling Rate

- **After every task commit:** Run `{quick run command}`
- **After every plan wave:** Run `{full suite command}`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 19 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 19-01-01 | 01 | 1 | REQ-{XX} | T-19-01 / — | {expected secure behavior or "N/A"} | unit | `{command}` | ✅ / ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

> **LEFT `draft` by the 2026-09-25 sweep (quick `260925-ghg`), and for a DIFFERENT reason than
> its siblings — read before "fixing" it.** The three items below are **unsubstituted template
> placeholders**, not real requirements: `{tests/test_file.py}` and `{tests/conftest.py}` are
> Python paths with the scaffold's braces still on them, in a TypeScript/Rust repo that has no
> Python test suite. Nothing was ever written here.
>
> So this is not staleness — the seven drafts advanced that day had real checklists whose
> artifacts had landed. Ticking these boxes would assert that three files exist which were never
> meant to. Advancing `status:` would assert a validation contract that was never authored.
>
> **What closing this actually needs:** decide whether Phase 19 needed a Wave 0 at all (the
> template's own escape hatch, quoted below, is the likely answer), then replace these three
> lines with that sentence or with the real artifact list. That is a content decision about a
> completed phase, not a bookkeeping flip, which is why the sweep declined to make it.

- [ ] `{tests/test_file.py}` — stubs for REQ-{XX}
- [ ] `{tests/conftest.py}` — shared fixtures
- [ ] `{framework install}` — if no framework detected

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| {behavior} | REQ-{XX} | {reason} | {steps} |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 19s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** {pending / approved YYYY-MM-DD}
