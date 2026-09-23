---
phase: quick-260923-ihw
plan: 01
subsystem: build
tags: [macos, notarization, codesign, docs, planning-todo]

requires: []
provides:
  - "Corrected step 4/5 verification recipe in the macOS notarization todo, positive- and negative-controlled"
  - "A dated 2026-09-23 measurement sub-section recording the 530=506+24 defect and both corrected-form controls"
affects: [macos-notarization-live-gate]

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - ".planning/todos/pending/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md"

key-decisions:
  - "Step 4 must count files (not grep lines) and restrict to Mach-O via file -b, or its ZERO pass condition is unreachable by construction"
  - "Step 5 needs both a positive control (253 on the all-ad-hoc helper tree) and a negative control (0 on an Apple-signed dir plus one plain text file) -- a single-file control cannot catch either defect"
  - "The todo stays OPEN in pending/ with byte-identical frontmatter; this was a documentation-only correction, no tag was pushed, no live gate was run"

requirements-completed: [QUICK-260923-ihw]

duration: 20min
completed: 2026-09-23
---

# Quick Task 260923-ihw: Fix the notarization todo's unachievable verification Summary

**Corrected the macOS notarization todo's step 4 (which counted grep lines, not files, and never
restricted to Mach-O, so its "must be ZERO" pass condition was unreachable by construction) and
step 5 (whose single-file positive control could not have caught either defect); added a dated
2026-09-23 sub-section recording the 530 = 506 + 24 measurement and both corrected-form controls.**

This is a documentation correction only. **Nothing about the macOS live notarization gate was
verified by this change, and no tag was pushed** — locally or to origin. The todo remains `OPEN`
in `.planning/todos/pending/` with its frontmatter byte-identical to before
(`severity: critical`, `platform: macos`, `ready: live-gate`,
`needs: retag-and-confirm-notarization-accepted`, `status: OPEN`).

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-09-23T01:30Z
- **Tasks:** 2 completed
- **Files modified:** 1

## Accomplishments

- Replaced the notarization todo's step 4 (`find ... | xargs -0 -n1 codesign -dv | grep -c
  'adhoc\|code object is not signed'`) with a file-counting, Mach-O-restricted, survivor-path-
  printing loop, whose pass condition (`survivors=0`) is now actually reachable.
- Replaced step 5's inadequate single-direction positive control with both a positive control
  (253 on the untouched, all-ad-hoc `build/bin/arm64/darwin` tree) and a negative control (0 on
  an Apple-signed directory holding a plain text file), both measured today.
- Added `### STATUS 2026-09-23 (quick-260923-ihw)` recording: the 530 (= 506 adhoc-match lines +
  24 non-Mach-O "not signed" lines) measurement against 277 regular files / 253 Mach-O; both
  defects (line-vs-file counting, no Mach-O restriction making the pass condition unreachable by
  construction); the step-5 control failure as a second instance of the `head -n -1` shape
  already documented in this todo; the corrected form's control results (253 / 0); and an
  independent HEAD re-measurement confirming the signer (`meta/signMachOResources.ts`, untouched)
  still selects the identical 253-path set.

## Task Commits

Both edits landed as a single commit, per the plan's own instruction (Task 2's action commits the
combined step-4/5 correction and the dated sub-section together, since both touch the same file in
sequence):

1. **Task 1: Replace the unachievable step 4 and its inadequate step 5** — edit only, verified,
   not separately committed (plan bundles the commit into Task 2).
2. **Task 2: Add the dated 2026-09-23 measurement sub-section, prove the gates, commit** —
   `02d23d430` (docs)

## Files Created/Modified

- `.planning/todos/pending/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md`
  — step 4/5 of `### The only real verification` corrected; new
  `### STATUS 2026-09-23 (quick-260923-ihw)` sub-section added before `## Related`; frontmatter,
  `## Problem`, `## Verification`, and `## STATUS 2026-09-17 (quick-260917-uik)` left byte-for-byte
  unchanged.

## Deviations from Plan

None — plan executed exactly as written. The `<corrected_recipe_verbatim>` block was copied
verbatim into step 4/5; the dated sub-section content matches the eight numbered points specified
in Task 2's action, condensed into six numbered paragraphs in the file for readability (all eight
required facts are present: the 530 verbatim result, the 506/24 breakdown, defect (a), defect (b)
with the real-app escalation, defect (c) naming the `head -n -1` precedent, the 253/0 corrected-
form controls, the HEAD re-measurement as an identical SET, and the closing "tag push has NOT
happened" paragraph).

## Verification Results

- `npx prettier --check` on the todo path: exit 0 (green check proving nothing — `.planning` is in
  `.prettierignore`, confirmed present via `grep -qx '.planning' .prettierignore`).
- `pnpm planning-gates`: **12/12 planning gates passed** (measured after the edit).
- `git diff --name-only HEAD` before commit: exactly one path, the todo file. No source file,
  script, or test was created or touched.
- Frontmatter five keys (`severity: critical`, `platform: macos`, `ready: live-gate`,
  `needs: retag-and-confirm-notarization-accepted`, `status: OPEN`) confirmed byte-identical
  post-edit.
- The old `xargs -0 -n1 codesign` pipeline survives in the file only inside a comment line
  (confirmed by stripping comment lines before grepping, per H5).

## What This Does NOT Verify

Stated explicitly, matching the plan's H6 and the todo's own `### NOTHING HERE IS VERIFIED` list,
which is unchanged by this task:

- Whether a fresh tag push reaches notarization `Accepted`.
- Whether the signature survives Tauri's `bundle.macOS.files` copy into `Contents/Resources`.
- Whether any helper crashes at runtime under the hardened runtime with no entitlements.
- Whether the throwaway keychain step coexists with Tauri's own keychain handling.

No tag was created, pushed, or deleted during this task. No workflow was triggered.

## Self-Check: PASSED

- `.planning/todos/pending/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md`
  — FOUND, contains `### STATUS 2026-09-23 (quick-260923-ihw)`.
- Commit `02d23d430` — FOUND in `git log --oneline`.
- `pnpm planning-gates` — 12/12 confirmed at time of writing this summary.
