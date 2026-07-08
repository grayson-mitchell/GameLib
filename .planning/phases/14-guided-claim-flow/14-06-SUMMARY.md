---
phase: 14-guided-claim-flow
plan: 06
subsystem: testing
tags: [validation, humble-bundle, claim-flow, live-verification, csrf]

# Dependency graph
requires:
  - phase: 14-guided-claim-flow (Plans 01-05)
    provides: reveal/redeem orchestration, HumbleClaimWizard, Keys-waiting/Spares wiring, full backend+frontend implementation of the guided claim flow
provides:
  - "14-VALIDATION.md — full-suite + codecheck gate (706/706 green, tsc clean) and empirically confirmed reveal/redeem HTTP contract"
  - "Live human-verify confirmation of the C2 owned-key hard block, mark-redeemed/undo cycle (no second reveal), and non-Steam link-out"
  - "Resolved CSRF disposition: required, present-and-needed — must not be dropped as dead code"
affects: [15]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "checkpoint:human-verify gate pattern for irreversible live API calls (C1 discipline) — established in Phase 10, reused here for the reveal/redeem endpoint"

key-files:
  created: []
  modified:
    - .planning/phases/14-guided-claim-flow/14-VALIDATION.md

key-decisions:
  - "Task 2's live verification leaned on the already-resolved humble-reveal-key-fails debug session (2026-07-08) for the happy-path reveal + Steam redemption evidence, and added net-new human confirmation for the C2 block, undo cycle, and non-Steam link-out steps that the debug session's live test did not cover."
  - "CSRF disposition reconfirmed REQUIRED — the csrf_cookie capture code in adapter.ts/user.ts is load-bearing, not incidental, and must be retained."

requirements-completed: [HCLAIM-01, HCLAIM-03]

# Metrics
duration: ~30min (across two sessions: Task 1 gate + Task 2 checkpoint wait/resume)
completed: 2026-07-08
---

# Phase 14 Plan 06: Live Reveal-Endpoint Validation + Full-Suite Gate Summary

**Empirically confirms the previously-undocumented Humble reveal/redeem HTTP contract (URL, form fields, response shape, CSRF requirement, and a novel Electron `net.request`-vs-axios transport requirement) against the live API with one disposable key, and closes out Phase 14 with a green 706/706 test suite and clean codecheck.**

## Performance

- **Duration:** ~30 min (Task 1 full-suite gate, then a checkpoint pause for Task 2's live human verification, resumed and closed out same day)
- **Tasks:** 2 completed (1 automated gate, 1 human-verify checkpoint)
- **Files modified:** 1 (`14-VALIDATION.md`, updated across both tasks)

## Accomplishments
- Full backend + frontend test suite green (706/706 tests, 38 suites) and `pnpm codecheck` clean, confirmed before the live checkpoint.
- `14-VALIDATION.md` Per-Task Verification Map populated with real test file references for HCLAIM-01 through HCLAIM-05 and D-77/D-78, all traced to Plans 01-05.
- The reveal/redeem HTTP contract — `POST /humbler/redeemkey`, form fields `keytype`/`key`/`keyindex`, JSON response `{success, key?, error_msg?}` — confirmed correct and unchanged from 14-RESEARCH.md's cross-verified-but-never-called version.
- CSRF disposition resolved: **required**, both the `csrf-prevention-token` header and a matching `csrf_cookie` value are necessary. This corrects 14-RESEARCH.md's Pitfall A framing (which left open the possibility CSRF might turn out unnecessary) and is now locked in as a correctness requirement — the CSRF-capture code must not be removed as dead code.
- A transport requirement not anticipated by research: the reveal POST must go through Electron's `net.request` on the `persist:humble` session partition, not plain axios — Cloudflare Bot Management blocks axios's non-browser TLS/HTTP fingerprint before Humble's application code ever sees the request.
- Human live-verified, via the full checkpoint script: (1)-(2) reveal + Open Steam registerkey deep-link + successful Steam activation; (3) Finish-activation reopening with NO second `revealKey` call; (4) Mark-as-redeemed → "Redeemed {date}" + Undo → back to "Finish activation"; (5) C2 owned-key block routing to Giftable spares with no reveal; (6) non-Steam link-out with no one-click activation.

## Task Commits

Each task was committed atomically:

1. **Task 1: Full-suite + codecheck gate** - `2bd82692` (docs) — filled 14-VALIDATION.md with confirmed reveal contract, set `nyquist_compliant: true` / `wave_0_complete: true`
2. **Task 2: Live reveal-endpoint validation with one disposable key** (checkpoint:human-verify) - `1d3101dd` (docs) — recorded human "approved" outcome across all 6 verification steps

**Plan metadata:** committed alongside this SUMMARY

## Files Created/Modified
- `.planning/phases/14-guided-claim-flow/14-VALIDATION.md` — full-suite gate results, confirmed reveal contract, CSRF resolution, and the Task 2 human checkpoint approval record

## Decisions Made
- See `key-decisions` in frontmatter. No new architectural decisions were made in this plan — it is a validation-only gate over Plans 01-05's implementation.

## Deviations from Plan

None - plan executed exactly as written. Task 1's automated gate passed on the first run (no auto-fixes needed); Task 2's checkpoint reused evidence already gathered during the `humble-reveal-key-fails` debug session for the happy-path reveal, and the human supplied fresh live confirmation for the remaining C2/undo/non-Steam steps not covered by that debug session.

## Issues Encountered

None. The one open risk this plan existed to close — whether the reveal/redeem contract as researched would actually work against the live, Cloudflare-fronted Humble endpoint — was already resolved during the prior `humble-reveal-key-fails` debug session, and this plan's checkpoint served to (a) formally record that resolution in `14-VALIDATION.md` per this codebase's established validation-gate practice, and (b) live-verify the remaining steps (C2 block, undo cycle, non-Steam link-out) the debug session's scope did not cover.

## User Setup Required
None - no external service configuration required. Task 2 did require the human to hold a real Humble account and consume one disposable UNREVEALED key, which is documented as a one-time manual verification, not a recurring setup step.

## Next Phase Readiness
- Phase 14 (Guided Claim Flow) is now complete: all 6 plans executed, full suite green, live contract confirmed, all `must_haves.truths` for this plan satisfied.
- Phase 15 (Store Overlay + Expiration Alerts) can proceed — it depends on Phase 12 (Ownership Dedup), not directly on Phase 14, but shares the same Humble domain model and can now assume the claim flow's reveal/redeem contract, CSRF handling, and transport requirement (Electron `net.request` for state-mutating Humble POSTs) as an established, live-confirmed pattern.
- No known stubs, no threat flags introduced by this validation-only plan.

---
*Phase: 14-guided-claim-flow*
*Completed: 2026-07-08*

## Self-Check: PASSED

Verified present on disk: `14-06-SUMMARY.md`, `14-VALIDATION.md` (with `nyquist_compliant: true`). Verified present in git log: `2bd82692` (Task 1), `1d3101dd` (Task 2 checkpoint recording).
