# Phase 23: Steam full-ownership install (StateFlags=4) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-17
**Phase:** 23-steam-full-ownership-install-stateflags-4
**Areas discussed:** StateFlags policy, Ownership scope boundary, File-mode fidelity, Pre-ship validation gate, Resume policy (reconciliation)

---

## StateFlags policy

| Option | Description | Selected |
|--------|-------------|----------|
| 4 with 1026 fallback | Write StateFlags=4 when GameLib proves a clean complete download; fall back to Phase 21's 1026 verify-handoff when completeness is uncertain. Native install stays under existing D-13 opt-in; no new toggle. | ✓ |
| Always 4 | Every native install writes 4, remove the 1026 writer. Simpler, but un-provable cases risk shipping broken with no safety net. | |
| 1026 default, 4 opt-in | Keep 1026 default, put StateFlags=4 behind an additional flag. Most conservative. | |

**User's choice:** 4 with 1026 fallback.
**Notes:** → CONTEXT D-01/D-02/D-03. 1026 writer retained as fallback; no new user toggle (inherits D-13 opt-in).

---

## Ownership scope boundary (D-2 reversal)

| Option | Description | Selected |
|--------|-------------|----------|
| First-install only; updates stay Steam's | Own the complete first install; interrupted/resume out of scope; updates 100% Steam's. Tightest, most shippable. | |
| Include resume/interrupted-download ownership | GameLib also owns recovery from an interrupted download. Larger lift (partial-state tracking + re-selection). | ✓ |
| First-install + updates | Full takeover including updates; reopens build-vs-bundle. Very large. | |

**User's choice:** Include resume/interrupted-download ownership.
**Notes:** → CONTEXT D-04/D-05. Chose the larger scope over the recommended tight option. Updates still stay Steam's. Triggered the Resume policy reconciliation below.

---

## File-mode fidelity

| Option | Description | Selected |
|--------|-------------|----------|
| All flags, POSIX only | Executable+CustomExecutable (proven) + ReadOnly+Hidden (defensive) via chmod on macOS/Linux; Windows needs none. | |
| Executable-only | Just the two proven bits; add others only if a title breaks. | |
| Full fidelity, all OSes | Also replicate Windows read-only/hidden attributes. Highest fidelity. | ✓ |

**User's choice:** Full fidelity, all OSes.
**Notes:** → CONTEXT D-06. Replicate the full EDepotFileFlag set including Windows attributes.

---

## Pre-ship validation gate

| Option | Description | Selected |
|--------|-------------|----------|
| Multi-depot + hard-DRM, macOS first | Gate on a multi-depot larger title + a hard-DRM title on macOS; expand OS coverage after. | ✓ |
| Broad: multi-depot + DRM + all 3 OSes | Verify everything on all three platforms before ship. Highest confidence, slowest. | |
| Narrow: WazHack-class only | Ship single-depot full-ownership now, defer multi-depot/DRM. Fastest, narrower guarantee. | |

**User's choice:** Multi-depot + hard-DRM, macOS first.
**Notes:** → CONTEXT D-07. Windows/Linux validation deferred to follow-up (noted in Deferred Ideas).

---

## Resume policy (reconciliation)

Raised because "own resume" + "4-with-1026-fallback" + "macOS-first validation" interact.

| Option | Description | Selected |
|--------|-------------|----------|
| Resume aims for 4; 1026 last resort; resume IS a ship gate | Resumed download re-verifies chunks + re-applies modes → trustworthy 4; 1026 only when even resumed state can't be proven; interrupt-then-resume added to the validation gate. | ✓ |
| Resume always falls back to 1026 | Interrupted installs write 1026 (Steam verify-repairs); only clean downloads get 4. | |
| Resume aims for 4, but not a ship gate | Build resume→4 but don't block ship on hardware-verifying the resume path. | |

**User's choice:** Resume aims for 4; 1026 is last resort; resume IS a ship gate.
**Notes:** → CONTEXT D-04 + D-07 (item 3). Reconciles the three answers coherently: resume targets full ownership, 1026 is the safety net, and an interrupt-then-resume run is part of the pre-ship gate.

---

## Claude's Discretion

- Mechanism for detecting current public buildid vs. a mid-download buildid change (correct behavior likely "write the buildid we downloaded," which Steam reads as UpdateRequired).
- Where the "provable completeness" gate lives (finalizeToSteam vs. dedicated verifier vs. resume reconciler).

## Deferred Ideas

- Always-4 (remove 1026 entirely) — revisit if the fallback never fires.
- Windows/Linux validation gate — deferred to a follow-up (D-07 ships macOS-first).
- Confirming non-file-mode verify-pass side effects (e.g. Steam-created config) are not load-bearing — verify during Phase 23 validation.

**Also corrected during discussion:** ROADMAP.md "Depends on: Phase 22" → Phase 21 (Phase 22 is the independent macOS-bottles line); ROADMAP Goal + de-risk note filled in from spike 003.
