---
quick_id: 260924-pm3
subsystem: docs
tags: [signpath, code-signing, windows, todo-triage]

# Dependency graph
requires: []
provides:
  - Windows code-signing todo retargeted to the SignPath Foundation decision
  - Four 2026-09-24 findings recorded (EV-parity, HSM-mandatory .p12 impossibility, workflow audit, SignPath/updater-signature collision)
  - Direction rewritten to a three-step SignPath route with build/sign/re-sign/upload ordering called out before credentials
affects: [windows-release-signing]

key-files:
  modified:
    - .planning/todos/pending/2026-09-14-windows-releases-ship-unsigned-no-windows-cert-enrolled.md

key-decisions:
  - "Operator will pursue SignPath Foundation (free OV-level signing for qualifying OSS projects) over a paid OV/EV certificate, with a commercial-CA OV fallback if SignPath declines"
  - "needs: retargeted from certificate-purchase-then-verify to signpath-foundation-application-then-verify"

requirements-completed: [DOC-260924-pm3]

duration: 12min
completed: 2026-09-24
---

# Quick Task 260924-pm3: Correct the Windows code-signing todo Summary

**Retargeted the Windows code-signing todo from a dead OV/EV + `.p12`-export decision to a SignPath Foundation application, recording four 2026-09-24 findings including a previously-unrecorded collision between SignPath's post-build signing and `createUpdaterArtifacts: true`.**

## Performance

- **Duration:** ~12 min
- **Tasks:** 2 completed
- **Files modified:** 1

## Accomplishments

- Frontmatter `needs:` retargeted to `signpath-foundation-application-then-verify`; the three CI-enforced triage keys (`severity`, `platform`, `ready`) left bare/lowercase/unchanged
- Inserted a `## STATUS 2026-09-24 (quick 260924-pm3)` section above `## Problem`, recording the SignPath Foundation decision (with the Azure individual-tier exclusion and OV-cert fallback) and four findings: EV's instant-SmartScreen bypass was removed in 2024 (Finding 1), `.p12` export has been impossible for any certificate issued since June 2023's HSM mandate (Finding 2), a read-only audit confirming the workflow's existing secret-gating logic is correct and the defect is purely the credential shape (Finding 3), and a new finding that SignPath's post-build signing model collides with `createUpdaterArtifacts: true` and `tauri-action`'s single build-and-upload step (Finding 4)
- Rewrote `## Direction` from the old four-step OV/EV-decide-then-export-`.p12` sequence (unachievable as written) to three steps: apply to SignPath Foundation, design the build → sign → re-sign → upload ordering before wiring credentials, and fall back to a commercial OV certificate only if SignPath declines
- Added a fifth `## Verification` bullet: after the first signed release, verify the published `.sig` against the SIGNED installer bytes and confirm an actual in-app update completes — closing the exact gap Finding 4 describes
- Per orchestrator addendum: struck through the now-false "an EV certificate gets it immediately" claim in `## Why it matters` item 2, in place, pointing at the new STATUS section — matching the exact convention already used by the macOS sibling todo (`2026-09-04-macos-...md:134`)
- `## Problem`, `## Current behaviour`, `## Related`, and `## Carried residual (2026-09-22, quick 260922-txw)` all survive unchanged, and the four pre-existing Verification bullets survive verbatim

## Task Commits

1. **Task 1: Retarget `needs:` and insert the STATUS 2026-09-24 section with all four findings** - `042d239f1` (docs)
2. **Task 2: Rewrite Direction to the SignPath route and add the updater verification bullet** (includes the orchestrator-mandated EV-claim strikethrough) - `5f45db03c` (docs)

## Files Created/Modified

- `.planning/todos/pending/2026-09-14-windows-releases-ship-unsigned-no-windows-cert-enrolled.md` - Retargeted `needs:`, added STATUS 2026-09-24 section (decision + 4 findings), rewrote Direction, added updater-signature verification bullet, struck through the superseded EV claim

## Decisions Made

- Followed the orchestrator addendum's binding correction: the plan's Task 2 originally said to leave `## Why it matters` untouched, citing the macOS half's convention as the reason not to mark it — that reading was verified wrong (the macOS todo does strike through its own superseded claim in place at line 134). Applied the same strikethrough-plus-SUPERSEDED-pointer shape here rather than leaving the false EV claim unmarked, per the orchestrator's explicit binding instruction.

## Deviations from Plan

**1. [Orchestrator addendum, binding] Struck through the false EV-instant-SmartScreen claim in `## Why it matters` item 2**
- **Found during:** Task 2
- **Issue:** The plan's Task 2 action explicitly said to leave `## Why it matters` alone, reasoning that Finding 1 "names it by reference" was sufficient and matched the macOS half's convention. The orchestrator addendum verified this reasoning was incorrect: the macOS sibling todo (`2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md:134`) DOES strike through its own superseded Direction claim in place, with a `**SUPERSEDED <date> — see the STATUS section above.**` pointer immediately after the strikethrough.
- **Fix:** Struck through only the specific false clause ("an EV certificate gets it immediately") in item 2, inserted a `**SUPERSEDED 2026-09-24 — see the STATUS section above.**` pointer in the same shape as the macOS file, and kept the rest of item 2 (OV-accumulates-slowly, cost/HSM/CI observations) intact and unstruck, since those remain true.
- **Files modified:** `.planning/todos/pending/2026-09-14-windows-releases-ship-unsigned-no-windows-cert-enrolled.md`
- **Verification:** Re-read the full file top to bottom; confirmed a reader reaching item 2 now sees the strikethrough and pointer rather than an unmarked false claim, matching the macOS convention exactly.
- **Committed in:** `5f45db03c` (part of Task 2 commit)

---

**Total deviations:** 1, explicitly directed by the orchestrator addendum (not a Rule 1-4 auto-fix)
**Impact on plan:** Corrects a factual/consistency gap the plan itself acknowledged uncertainty about. No scope creep — same single file, no new content beyond the strikethrough and pointer sentence.

## Issues Encountered

None. Both tasks' `<verify>` blocks passed on the first run, including `git diff --name-only | wc -l` returning `1` (scope-fence assertion).

## User Setup Required

None - no external service configuration required. The SignPath Foundation application itself remains a human-gated step recorded in the todo's `## Direction`, not performed by this quick task (scope fence explicitly forbade applying for anything).

## Next Phase Readiness

- The Windows code-signing todo now points at an achievable path (SignPath Foundation) instead of a dead one (OV/EV decision + `.p12` export)
- Finding 4 (SignPath post-build signing vs. `createUpdaterArtifacts: true`) is the most consequential unblocked-but-unresolved item: it must be designed before credentials are wired, per the rewritten Direction step 2
- No code or workflow files were touched; this was a document-correction-only task as scoped

---
*Quick task: 260924-pm3*
*Completed: 2026-09-24*
