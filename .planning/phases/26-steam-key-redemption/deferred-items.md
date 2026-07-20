# Deferred Items — Phase 26 (steam-key-redemption)

## REQUIREMENTS.md has no Phase 26 section yet

**Found during:** 26-02 execution, `requirements.mark-complete REQ-26-03` step.

**Issue:** `.planning/REQUIREMENTS.md` has no Phase 26 / v0.7-key-redemption section or traceability
rows for `REQ-26-01`..`REQ-26-06`, even though both 26-01-SUMMARY.md (`requirements-completed:
[REQ-26-02, REQ-26-04, REQ-26-05, REQ-26-06]`) and this plan's frontmatter (`requirements:
[REQ-26-03]`) reference these IDs. `gsd-sdk query requirements.mark-complete REQ-26-03` returns
`not_found` because there is nothing to check off.

**Scope decision:** Out of scope for a single-plan executor — minting a phase's requirements
section into REQUIREMENTS.md is a planning-time responsibility (`/gsd-plan-phase`), not something
a per-plan executor should backfill mid-phase. Not fixed here; logged instead per the deviation
rules' scope boundary ("Pre-existing warnings ... in unrelated files are out of scope").

**Suggested follow-up:** Before or during closing out Phase 26, mint the `REQ-26-01`..`REQ-26-06`
traceability rows into REQUIREMENTS.md (matching the pattern used for Phase 23/25) so
`requirements.mark-complete` can actually check them off.
