---
phase: 14-guided-claim-flow
plan: 07
subsystem: humble-claim-flow
tags: [humble, classification, state-machine, ipc, typescript]

# Dependency graph
requires:
  - phase: 14-guided-claim-flow (plans 01-06)
    provides: HumbleClaimWizard, reveal/mark-redeemed/undo IPC surface, audit log, keyindex side-channel
provides:
  - Realigned classifyTpk precedence (expiry > local-redeemed-mark > revealed-ness > unrevealed) matching Humble's actual reveal/redeem model
  - REDEEMED as a local-only, always-undoable overlay (no server-derived REDEEMED path)
  - Simplified selectKeysWaiting/markRedeemed/undoRedeemed with the CR-01/WR-02 compensation machinery removed
  - HUMBLE_CLASSIFIER_VERSION 5 (forces reclassification of previously-mismarked cached rows)
  - Amended D-30 decision record (PROJECT.md) + deferred steam-user license corroboration follow-up
affects: [15-store-overlay-expiration-alerts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "REDEEMED state derives from exactly one predicate (isLocallyRedeemed) — never from server response data"
    - "View-membership helpers (selectKeysWaiting) take only the domain data they need to decide membership; annotation cross-referencing removed once the underlying state model made it unnecessary"

key-files:
  created: []
  modified:
    - src/backend/humble/classify.ts
    - src/backend/humble/constants.ts
    - src/common/humble/viewFilters.ts
    - src/backend/humble/library.ts
    - src/common/types/humble.ts
    - src/frontend/screens/Humble/Keys/Waiting/index.tsx
    - src/backend/humble/__tests__/classify.test.ts
    - src/backend/humble/__tests__/library.test.ts
    - src/backend/humble/__tests__/viewFilters.test.ts
    - src/frontend/screens/Humble/Keys/Waiting/__tests__/index.test.tsx
    - .planning/PROJECT.md
    - .planning/phases/14-guided-claim-flow/14-CONTEXT.md

key-decisions:
  - "D-30 amended: server truth is revealed-ness + expiry only; redeemed_key_val presence means REVEALED (Humble's reveal endpoint is /humbler/redeemkey), never REDEEMED"
  - "REDEEMED is produced solely by the user's explicit Mark-as-redeemed action (isLocallyRedeemed) and is always undoable — no second, non-undoable server-confirmed tier"
  - "D-24 freeze (allTerminal) no longer applies to a server-revealed-only key — Humble has no signal for 'done' beyond expiry or a local mark, so such keys are correctly re-fetched every sync going forward (accepted, not a regression)"
  - "steam-user license corroboration (payment_method === EPaymentMethod.ActivationCode + time_created) deferred to a future phase as the confident auto-mark-redeemed signal for pre-GameLib Humble-website reveals"

patterns-established:
  - "When a classification precedence bug is fixed, bump HUMBLE_CLASSIFIER_VERSION so cached rows reclassify on the next sync rather than staying frozen under the old (wrong) verdict"

requirements-completed: [HCLAIM-01, HCLAIM-04]

# Metrics
duration: ~35min
completed: 2026-07-09
---

# Phase 14 Plan 07: Gap Closure — Realign Claim-State Classification Summary

**Realigned classifyTpk so server `redeemed_key_val` presence means REVEALED (not REDEEMED); REDEEMED is now a local-only, always-undoable overlay produced solely by "Mark as redeemed" — closing UAT tests 2 (CR-01: Redeemed+Undo dropped on sync) and 3 (WR-02: revealed key silently flipped to Redeemed on sync) at their shared root cause.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-07-09
- **Tasks:** 3/3
- **Files modified:** 12 (10 source/test + 2 planning docs)

## Accomplishments
- `classifyTpk` precedence reordered: expiry → UNREDEEMABLE (D-30, unchanged) → `isLocallyRedeemed` → REDEEMED (the ONLY source of REDEEMED) → `redeemedKeyValuePresent || isLocallyRevealed` → REVEALED → else UNREVEALED
- Deleted the CR-01 `locallyRedeemedPending` field (from `HumbleKey`, `classifyOrder`, `patchCachedState`, `markRedeemed`/`undoRedeemed`) and the WR-02 `selectKeysWaiting` annotation keep-visible branch — both compensation workarounds are now redundant since the underlying classification is correct
- `markRedeemed`/`undoRedeemed` simplified to a single eligibility tier each (REVEALED↔REDEEMED); no more "server_confirmed_ack" acknowledgment path
- `HUMBLE_CLASSIFIER_VERSION` bumped 4→5 so every cached row previously misclassified REDEEMED-from-server reclassifies to REVEALED on the next sync
- PROJECT.md's D-30 decision record amended in place; `14-CONTEXT.md`'s stale D-77 rationale gets a one-line supersession pointer; steam-user license corroboration captured as an explicit deferred follow-up

## Task Commits

Each task was committed atomically:

1. **Task 1: Realign classifyTpk — redeemed_key_val = REVEALED, REDEEMED = local-only; bump classifier version** - `c55db55a` (fix)
2. **Task 2: Delete the compensation machinery — remove locallyRedeemedPending, WR-02 keep-visible, and server_confirmed_ack tier** - `7ee9a234` (refactor)
3. **Task 3: Amend the D-30 decision record and defer the steam-user auto-mark follow-up** - `7b14d5c2` (docs)

_Both Task 1 and Task 2 are tdd="true" per the plan; test-file updates (RED-equivalent assertion flips) were committed together with the implementation change in each task's single commit rather than as a separate preceding commit, since this is a targeted realignment of existing, already-covered logic rather than net-new behavior._

## Files Created/Modified
- `src/backend/humble/classify.ts` - classifyTpk precedence realigned; classifyOrder's CR-01 locallyRedeemedPending spread removed
- `src/backend/humble/constants.ts` - HUMBLE_CLASSIFIER_VERSION 4 → 5
- `src/common/humble/viewFilters.ts` - selectKeysWaiting(keys) drops the annotations param; REDEEMED included unconditionally
- `src/backend/humble/library.ts` - markRedeemed/undoRedeemed/patchCachedState simplified to the single local-overlay tier
- `src/common/types/humble.ts` - HumbleKey.locallyRedeemedPending removed; HumbleKeyState/RedeemOutcome doc comments updated
- `src/frontend/screens/Humble/Keys/Waiting/index.tsx` - selectKeysWaiting call site drops the annotations arg
- `src/backend/humble/__tests__/classify.test.ts` - REDEEMED-from-server assertions flipped to REVEALED; CR-01 pending-flag tests removed; new local-mark-wins-over-server-value coverage added
- `src/backend/humble/__tests__/library.test.ts` - markRedeemed/undoRedeemed tests rebuilt around the single-tier model; D-24 freeze test rebuilt around a genuinely terminal (expired) fixture; new test documents the accepted "server-revealed-only key is never frozen" consequence
- `src/backend/humble/__tests__/viewFilters.test.ts` - annotation-dependent WR-02 tests replaced with unconditional REVEALED/REDEEMED inclusion tests
- `src/frontend/screens/Humble/Keys/Waiting/__tests__/index.test.tsx` - locallyRedeemedPending reference removed from the undo-redeem test fixture
- `.planning/PROJECT.md` - D-30 amendment row added to Key Decisions; Deferred/Follow-up note added; footer updated
- `.planning/phases/14-guided-claim-flow/14-CONTEXT.md` - one-line supersession pointer added to the D-77 note

## Decisions Made
- **D-30 amended**: server truth is revealed-ness + expiry only. `redeemed_key_val` presence means REVEALED (Humble's reveal endpoint is literally `/humbler/redeemkey`), never REDEEMED — Humble has no knowledge of Steam activation. REDEEMED is a local-only, always-undoable overlay from the user's explicit "Mark as redeemed" action. Expiry → UNREDEEMABLE precedence is unchanged.
- **D-24 freeze semantics accepted change**: a server-revealed-only key (no local mark) is no longer `allTerminal` and is therefore re-fetched on every subsequent sync rather than frozen — this is an honest consequence of Humble having no "done" signal beyond expiry or an explicit local mark, not a regression. Documented via a new test (`14-07: a server-revealed (not locally-redeemed) key is never frozen`).
- **Deferred**: steam-user license corroboration (`payment_method === EPaymentMethod.ActivationCode` + `time_created`) as a confident auto-mark-redeemed signal for keys revealed on Humble's website before GameLib ever synced — scoped to a future phase; interim signal remains `ownedElsewhere` + the D-72 owned-note.

## Deviations from Plan

None - plan executed exactly as written. The plan's own `<critical_context>` anticipated and pre-authorized the one-line 14-CONTEXT.md addition beyond the plan's `files_modified` list (Task 3); that was applied as specified, not as an ad-hoc deviation.

## Issues Encountered
- Three pre-existing test assertions in `library.test.ts` (not enumerated individually in the plan's task actions) depended on the old server-redeemed → REDEEMED behavior and needed updates beyond the markRedeemed/undoRedeemed/CR-01-sync block explicitly named in Task 2: a "real-world tpk field names ... commit keys" zero-key-diagnostics test, and the classifier-version D-24 freeze test (which needed rebuilding around a genuinely terminal/expired fixture, since a server-revealed-only key is no longer terminal under the new model). Both were fixed in Task 2's commit as directly-caused test breakage from the realignment (Rule 1 scope — within the task's own files).

## User Setup Required

None - no external service configuration required.

## Known UX Consequences for Next Re-UAT

Two permanent, user-visible behavior changes result from this realignment — flagged here for the next human re-UAT pass, not defects:

1. **Marked-redeemed keys remain visible in Keys waiting** with "Redeemed {date}" + Undo until the key expires (REDEEMED is no longer excluded from `selectKeysWaiting`). This is intentional — Undo must always be reachable — but it means Keys waiting is no longer a strictly "still needs action" list; it also holds acknowledged-done keys until expiry clears them.
2. **Keys revealed on Humble's website before GameLib synced will (re)surface as REVEALED / "Finish activation"** the first time they're reclassified under `HUMBLE_CLASSIFIER_VERSION` 5, even if the user already activated them on Steam previously. This is honest per Humble's actual model (Humble cannot signal "activated on Steam"); the interim mitigation is the existing `ownedElsewhere` overlay + D-72 owned-note in the wizard's finish step. The steam-user license corroboration follow-up (deferred, see above) is the eventual fix.

## Next Phase Readiness
- Claim-state classification is now faithful to Humble's actual reveal/redeem model; UAT tests 2 and 3 should now pass on re-verification (manual re-UAT hook noted in the plan's `<verification>` section, not automated here)
- No blockers for Phase 15 (Store Overlay + Expiration Alerts) — this plan touched only classification/view/library internals, no IPC surface changes beyond removing the now-dead `locallyRedeemedPending` field from the broadcast `HumbleKey` shape

---
*Phase: 14-guided-claim-flow*
*Completed: 2026-07-09*

## Self-Check: PASSED

All modified/created files confirmed present on disk; all task commits (`c55db55a`, `7ee9a234`, `7b14d5c2`) and the summary commit (`5e463367`) confirmed present in git log.
