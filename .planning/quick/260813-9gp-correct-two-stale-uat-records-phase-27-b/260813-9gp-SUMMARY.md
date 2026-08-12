---
quick_id: 260813-9gp
status: complete
completed: 2026-08-13
tasks_completed: 2
tasks_total: 2
commits:
  - 1eda814b6 docs(27): blocker resolved -- tests 4/5 blocked -> pending, retestable
  - a150733fc docs(34.1): human_uat test 4 drags the NavShell navbar, not the sidebar
files_modified:
  - .planning/phases/27-tauri-shell-walking-skeleton/27-UAT.md
  - .planning/phases/34.1-tauri-ipc-re-plumb-slice-4-app-shell-and-window-chrome/34.1-VERIFICATION.md
---

# Quick Task 260813-9gp — Summary

**One-liner:** Corrected two UAT records whose recorded *cause* had been falsified by later
phases — phase 27's tests 4/5 no longer tell a tester to wait on a login-channel slice that
shipped in 34.4–34.5, and 34.1's frameless-drag test no longer points at a sidebar that Phase
34.10 deleted — without re-running or re-scoring either test.

## What changed

### Task 1 — `27-UAT.md`
Tests 4 and 5 went `result: blocked` → `result: pending`, `blocked_by: prior-phase` dropped.
`## Blocked Items` became `## Retestable Items`; Summary counts moved `blocked: 2 → 0`,
`pending: 0 → 2`; `updated:` bumped to 2026-08-13.

The original 2026-07-22 operator observation is preserved verbatim inside the new `reason:` block,
followed by the evidence that its cause is gone. `status: partial` was deliberately left alone —
two items are still untested, so the file is still partial.

### Task 2 — `34.1-VERIFICATION.md`
`human_verification` test 4 reworded from "drag the sidebar" to the NavShell navbar, with the old
wording retained inline as a traceable note. Added the negative case (interactive elements and
`.windowControls` must not drag) and named the exact untested code path.

## Evidence

The claim "the login-channel slice shipped" was checked against the tree, not against a SUMMARY:

| Claim | Evidence |
|---|---|
| Steam auth ported | `src/backend/sidecar/steamAuthFlowRegistration.ts` |
| GOG/Epic OAuth ported | `src/backend/sidecar/oauthLoginFlowRegistration.ts` |
| Runner auth ported | `src/backend/sidecar/runnerAuthFlowRegistration.ts` |
| The named channels exist | `startQRLogin`/`startCredentialLogin` in `storeManagers/steam/user.ts`, `main.ts`; tested in `sidecar/__tests__/steamAuthFlows.test.ts` |
| Phases complete | 34.4 / 34.4.1 / 34.4.2 / 34.5 all `complete` per `roadmap.analyze` |
| Sidebar retired | `Sidebar/index.tsx` absent; `NavShell/index.tsx:33` names it "the retired left navigation" |
| Drag surface moved | `resolveDragRegion` falls back to `.NavShell__navbar` — `preload/api/tauriWindowChrome.ts:333` |

Both edits were verified through the **real consumer** (`gsd-sdk query audit-uat`), not by
re-reading the files: phase 27 now reports `['pending','pending']`, category totals moved
`blocked 6 → 4`, `pending 0 → 2`, and the 34.1 item's name string comes back naming the NavShell
navbar. Total outstanding stayed at **26** — correct, because nothing was closed, only reclassified.

## What this task did NOT do

- **Neither test was run.** Both remain unverified by a human. This changed what the tests say,
  not their results. Phase 27 tests 4/5 have still never been observed passing.
- Phase 30's de-duplication (7 recorded items are really 2 tests) — audit recommendation 2, still open.
- The orphan `src/frontend/components/UI/Sidebar/components/SidebarTour.tsx` left behind by 34.10 —
  a real leftover, but code, not a UAT record.
- The `release:mac` arm64-only runner-bundle verification flagged in the audit — belongs to 34.9.

## Lesson

A `blocked_by: prior-phase` record is a claim with a shelf life: it is true when written and
silently rots the moment the prior phase lands. Nothing in the workflow re-checks it, so the item
stays suppressed long after its blocker is gone — phase 27's items sat blocked across four phases
that had already removed the cause. Blocker reasons need re-validation on the same schedule as the
tests they suppress, and the check is cheap: name the unblocking artifact concretely enough
(`unblocked_by:` → a file path, not a prose slice name) that a grep can falsify it later.
