---
phase: 11-library-sync-5-state-key-model
plan: 05
subsystem: testing
tags: [humble, jest, uat, validation, nyquist, electron-store, zod]

# Dependency graph
requires:
  - phase: 11-library-sync-5-state-key-model (plans 01-04)
    provides: classify/sync/IPC/UI implementation of the 5-state Humble key inventory plus its unit suites
  - phase: 10-humble-auth-adapter-scaffold
    provides: authenticated Humble adapter, redaction discipline (D-15), live-gate precedent for deferred defensive paths
provides:
  - Populated 11-VALIDATION.md (nyquist_compliant: true) with executed requirement→test map and full suite result
  - Live UAT sign-off on a real Humble account (25 gamekeys): 5-state rendering, read-only rows, progressive fill, fail-soft banner, freshness indicator — APPROVED 2026-07-06
  - "[ASSUMED] resolutions: A3 RESOLVED-CONFIRMED (redeemed_key_val semantics); A1 UNPICKED deferred (no un-picked month on tested account — defensive path only)"
  - Documented live Humble API field names that override HUMBLE-SPEC-SOURCE.md (redeemed_key_val, is_expired, expiry_date, num_days_until_expired)
affects: [phase-12, phase-13, phase-14, phase-15, humble, key-redemption]

# Tech tracking
tech-stack:
  added: []
  patterns: [live-UAT checkpoint with iterative fix rounds recorded as redacted validation findings, classifier-version cache re-classification so classifier fixes reach frozen orders]

key-files:
  created:
    - .planning/phases/11-library-sync-5-state-key-model/11-05-SUMMARY.md
  modified:
    - .planning/phases/11-library-sync-5-state-key-model/11-VALIDATION.md

key-decisions:
  - "Round-7 user product decision: key_type 'generic' entries (PDF/ebook bundles) stay in inventory but render in a separate collapsed 'Other' group placed last — never lose a key, but out of the game-key groups (refines D-28 display semantics; commit 2964fcf9)"
  - "HUMBLE-SPEC-SOURCE.md §2.1/Appendix A field names are inaccurate: live fields are redeemed_key_val (not redeemed_key_value), is_expired (bool), expiry_date (absolute), num_days_until_expired (relative, 0 = no window). Phases 12-15 MUST trust the live-confirmed names, not the spec's."
  - "A1 UNPICKED pseudo-entry left as unverified-defensive (no un-picked Choice month on the tested account) — same precedent as Phase 10's identity-advisory; deferred to a future live check"
  - "UNREDEEMABLE state relabeled 'Expired' in UI; state groups collapsible with Expired collapsed by default (user-requested during UAT rounds 4)"

patterns-established:
  - "Live-UAT fix rounds: each round gets a debug session file in .planning/debug/, a red/green-verified fix commit, and a redacted entry in the phase VALIDATION findings"
  - "classifierVersion stamp on cached orders forces re-classification of frozen orders when the classifier changes (11a0c515)"

requirements-completed: [HSYNC-01, HSYNC-02, HSYNC-03, HSYNC-04]

# Metrics
duration: ~1 day wall-clock (Task 1 ~15 min; Task 2 checkpoint spanned 7 live UAT rounds 2026-07-05 → 2026-07-06)
completed: 2026-07-06
---

# Phase 11 Plan 05: Validation + Live UAT Summary

**Real-account UAT approved after 7 live fix rounds: 5-state Humble key inventory (25 gamekeys) renders, fails soft, and classifies correctly on live data — 11-VALIDATION.md nyquist_compliant with A3 confirmed and A1 explicitly deferred**

## Performance

- **Duration:** ~1 day wall-clock (checkpoint-dominated)
- **Started:** 2026-07-05 (Task 1)
- **Completed:** 2026-07-06 (Task 2 approval)
- **Tasks:** 2/2 (1 auto + 1 human-verify checkpoint)
- **Files modified:** 1 planning artifact (plus 11 fix commits merged during the checkpoint)

## Accomplishments

- 11-VALIDATION.md fully populated: executed requirement→test map (classify.test.ts / library.test.ts / user.test.ts mapped to HSYNC-01..04 and threat refs), manual-only verification table, Wave 0 + sign-off checklists, `nyquist_compliant: true`
- Live UAT on a real Humble account (25 gamekeys) APPROVED by the tester 2026-07-06: sidebar gating, empty state, 5-state grouped/ordered rendering, strictly read-only rows, progressive fill, steady freshness indicator, and the HSYNC-04 fail-soft banner all confirmed PASS on live data
- Both RESEARCH [ASSUMED] items dispositioned: A3 RESOLVED-CONFIRMED (redeemed keys classify REDEEMED via live `redeemed_key_val`; unrevealed classify UNREVEALED); A1 UNPICKED deferred as unverified-defensive (no un-picked Choice month on the account)
- Seven live defects found by UAT were root-caused (three with full debug sessions in `.planning/debug/`) and fixed during the checkpoint; suite grew 396 → 514 tests, all green at approval

## Task Commits

1. **Task 1: Fill 11-VALIDATION.md + run full suite** - `ece271c3` (docs)
2. **Task 2: Real-account UAT (checkpoint:human-verify)** - no direct commit by this task; the checkpoint produced 11 fix commits (below) and the tester's "approved". Findings recorded in 11-VALIDATION.md by this plan's final commit.

**Fix commits merged during the Task 2 checkpoint (all on main, 514/514 green):**

| Round | Commits | What |
|-------|---------|------|
| 1 | `cfd5cafe` | CacheStore.entries() leaked nested `__timestamp` group — sync wedged, keys unreadable |
| 2 | `366e7ef9` | Terminal `humbleSyncStateChanged` event, syncing-flag thrash fix, single-flight + cooldown guards, redacted per-sync summary log |
| 3 | `379b8f42` | Request `?all_tpkds=true`; classify live field names `redeemed_key_val` / `is_expired` |
| 4 | `a1f36fd1`, `581be6d4`, `1c869532` | Live expiration fields `expiry_date` / `num_days_until_expired`; UNREDEEMABLE relabeled "Expired"; collapsible groups |
| 5 | `34c763a9`, `3199f2ee` | D-29 key_type filter; blank expiration slot on REDEEMED/Expired rows |
| 6 | `f34fc0d2`, `11a0c515` | Entitlement filter v2 (direct_redeem/non-game exclusion); classifier-version cache re-classification |
| 7 | `2964fcf9` | Generic-key entries grouped under collapsed "Other" section (user product decision) |

## Files Created/Modified

- `.planning/phases/11-library-sync-5-state-key-model/11-VALIDATION.md` - Filled validation contract (Task 1) + redacted Live UAT Findings section with per-check PASS table, [ASSUMED] resolutions, and the 7-round defect log (Task 2)
- `.planning/phases/11-library-sync-5-state-key-model/11-05-SUMMARY.md` - This summary

## Decisions Made

- **Generic keys → "Other" group (round 7, user decision at checkpoint):** `key_type: "generic"` entries (e.g. PDF/ebook bundles) remain in the inventory but render in a separate collapsed "Other" group placed after all game-key groups. Rationale: never silently drop a key the user owns, but keep the game-key groups clean. Explicit refinement of D-28's display semantics.
- **Spec override flag for Phases 12-15:** `.planning/research/HUMBLE-SPEC-SOURCE.md` §2.1/Appendix A is inaccurate on tpk field names. Live-confirmed names are `redeemed_key_val` (not `redeemed_key_value`), `is_expired` (bool), `expiry_date` (absolute), `num_days_until_expired` (relative, 0 = no expiry window). Future phases must trust the live-confirmed names — cross-corroborated by Playnite HumbleKeysLibrary and FailSpy humble-steam-key-redeemer sources.
- **A1 UNPICKED deferral:** the UNPICKED pseudo-entry code path stays defensive-only (unverified on live data) until an account with an un-picked Humble Choice month is available — same precedent as Phase 10's identity-advisory.
- **UI polish accepted during UAT:** UNREDEEMABLE displayed as "Expired"; state groups collapsible, Expired collapsed by default (both user-requested).

## Deviations from Plan

Task 2 was a human-verify checkpoint with an expected happy path of "observe and approve". Instead, seven rounds of live defects were discovered and fixed during the checkpoint (all Rule 1 bugs / Rule 2 missing-critical, plus one Rule-4-style product decision escalated to and made by the user):

### Auto-fixed Issues

**1. [Rule 1 - Bug] CacheStore.entries() leaked nested `__timestamp` bookkeeping group**
- **Found during:** Task 2 (UAT round 1 — spinner never resolved, keys unreadable)
- **Issue:** electron-store dot-notation created a top-level `__timestamp` object that entries() failed to filter; getKeys() threw mid-sync
- **Fix:** entries() excludes the nested group (also fixed the latent leak in steam/library.ts)
- **Verification:** red/green regression tests; debug session `.planning/debug/humble-sync-spinner-never-ends.md`
- **Committed in:** `cfd5cafe`

**2. [Rule 1 - Bug] Sync end-state never propagated to renderer; syncing flag thrashed**
- **Found during:** Task 2 (UAT round 2 — freshness line flicker, stale syncedAt, banner impossible)
- **Issue:** per-order keys push wrongly cleared `syncing`; syncedAt/syncError only read at mount
- **Fix:** terminal `humbleSyncStateChanged` event on every sync exit path; single-flight + cooldown guards; redacted per-sync summary log
- **Verification:** 14 new tests red pre-fix; debug session `.planning/debug/humble-keys-empty-list-flashing-sync.md`
- **Committed in:** `366e7ef9`

**3. [Rule 1 - Bug] Orders fetched key-less; spec field names wrong**
- **Found during:** Task 2 (UAT round 3 — 25/25 orders ok, zero keys extracted)
- **Issue:** adapter omitted `?all_tpkds=true`; classification read spec names `redeemed_key_value`/`expiration` that do not exist live
- **Fix:** request param added; classify reads `redeemed_key_val` and honors `is_expired`
- **Verification:** 17 new tests red pre-fix; debug session `.planning/debug/humble-zero-keys-from-valid-orders.md`
- **Committed in:** `379b8f42`

**4. [Rule 1 - Bug] Expiration extraction used non-existent field**
- **Found during:** Task 2 (UAT round 4)
- **Issue:** live payloads carry `expiry_date` / `num_days_until_expired`, not `expiration`
- **Fix:** parse real fields; plus user-requested "Expired" label and collapsible groups
- **Committed in:** `a1f36fd1`, `581be6d4`, `1c869532`

**5. [Rule 1 - Bug] Non-key download entitlements polluted inventory; misleading "No expiration" on terminal rows**
- **Found during:** Task 2 (UAT round 5, D-29)
- **Fix:** entries without `key_type` excluded; REDEEMED/Expired rows show blank expiration slot
- **Committed in:** `34c763a9`, `3199f2ee`

**6. [Rule 2 - Missing Critical] Entitlement filter v2 + classifier-version cache re-classification**
- **Found during:** Task 2 (UAT round 6)
- **Issue:** `direct_redeem: true` and non-game key_type entries still leaked in; classifier fixes never reached frozen (all-terminal) cached orders
- **Fix:** filter grounded in Playnite/Galaxy real captures; classifierVersion stamp forces re-classification of stale cache entries
- **Committed in:** `f34fc0d2`, `11a0c515`

### User-Decided at Checkpoint

**7. [Product decision] Generic keys grouped under collapsed "Other" section**
- **Found during:** Task 2 (UAT round 7)
- **Decision by:** user, at the checkpoint (never lose a key, but keep game-key groups clean)
- **Committed in:** `2964fcf9`

---

**Total deviations:** 6 auto-fixed (5 Rule 1, 1 Rule 2) + 1 user product decision
**Impact on plan:** No scope creep — every fix was required for the plan's own success criterion ("real account renders every populated state correctly and fails soft"). The checkpoint did exactly its job: unit-green code met live data and the live-only defects (store bookkeeping leak, renderer propagation gap, real API field names) were flushed out before phase close. Test suite grew 396 → 514, all green.

## Issues Encountered

- `.planning/research/HUMBLE-SPEC-SOURCE.md` proved inaccurate on live tpk field names (see Decisions Made) — flagged for Phases 12-15 rather than silently corrected, since the spec file is a research artifact of record.

## User Setup Required

None - no external service configuration required. (UAT required the tester's own connected Humble account, which was already configured in Phase 10.)

## Next Phase Readiness

- Phase 11 requirements HSYNC-01..04 fully validated: automated coverage green (31 suites / 514 tests) and live UAT approved
- Live-confirmed Humble API field names documented for Phases 12-15 (`redeemed_key_val`, `is_expired`, `expiry_date`, `num_days_until_expired`)
- Open deferral: A1 UNPICKED pseudo-entry remains unverified on live data (defensive path only) — pick up when an account with an un-picked Humble Choice month is available

## Self-Check: PASSED

- All 12 cited commit hashes verified present on main (`ece271c3`, `cfd5cafe`, `366e7ef9`, `379b8f42`, `a1f36fd1`, `581be6d4`, `1c869532`, `34c763a9`, `3199f2ee`, `f34fc0d2`, `11a0c515`, `2964fcf9`)
- 11-VALIDATION.md and all three cited debug session files exist
- No `pending` markers remain in 11-VALIDATION.md outside the status legend

---
*Phase: 11-library-sync-5-state-key-model*
*Completed: 2026-07-06*
