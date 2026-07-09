---
status: diagnosed
phase: 14-guided-claim-flow
source: [14-01-SUMMARY.md, 14-02-SUMMARY.md, 14-03-SUMMARY.md, 14-04-SUMMARY.md, 14-05-SUMMARY.md, 14-06-SUMMARY.md, 14-REVIEW-FIX.md]
started: 2026-07-09T00:00:00Z
updated: 2026-07-09T02:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Quit GameLib completely. Relaunch the dev build from scratch. App boots without errors, Humble Keys screen renders both tabs, and a Humble sync completes — no blank lists, no crash from the new claim/audit stores or classifier-version bump.
result: pass

### 2. Redeemed + Undo survives a sync (CR-01 fix)
expected: With a key showing "Redeemed {date}" + "Undo" (from Mark as redeemed), trigger a Humble sync. After the sync finishes, the row STILL shows "Redeemed {date}" + "Undo" — it does not vanish from Keys waiting, and Undo still works.
result: pass
retest: "2026-07-09 after 14-07 gap closure + fix commits: Resident Evil Village keeps 'Redeemed {date}' + Undo through sync. Original failure: 'fail, after sync changes to redeemed'."

### 3. Revealed key keeps "Finish activation" after sync (WR-02 fix)
expected: A key that has been revealed but NOT marked redeemed (row shows "Revealed {date}" + "Finish activation") stays visible in Keys waiting with the same button after a Humble sync — the server seeing the revealed key must not silently drop the row.
result: pass
retest: "2026-07-09 after 14-07 gap closure + fix commits: Californium keeps 'Revealed {date}' + Finish activation through sync. Original failure diagnosed as classifier misalignment (redeemed_key_val treated as Steam-REDEEMED); fixed by 14-07."

### 4. Undo a mistaken ownership override (WR-04 fix)
expected: On a fuzzy "Likely owned" row in Giftable spares, click "Not the same game". The key moves to Keys waiting, and THERE it now shows an "Undo — I do own this game" control. Clicking it returns the key to Giftable spares. (Non-overridden fuzzy Spares rows no longer show a confusing pre-emptive Undo button.)
result: skipped
reason: "No fuzzy-matched key available to test — the only key in Spares is an exact match."

### 5. Finish activation loads without hanging (WR-05 fix)
expected: Clicking "Finish activation" on a revealed key opens the wizard and shows the key promptly — never an infinite "Loading…" state. (If anything fails, you get an explicit outcome message, not a hang.)
result: blocked
blocked_by: other
reason: "User: I think this was tested in an earlier test stage? don't have any more keys to test with at the moment, so lets defer. (Happy path was exercised live during the 14-06 checkpoint undo cycle, pre-fix; the WR-05 change only touched error paths.)"

### 6. C2 owned-key block (re-confirm from live checkpoint)
expected: Clicking "Claim" on an owned or "Likely owned" key shows the "You already own this on Steam" panel routing to Giftable spares — no reveal happens. (You verified this live yesterday; quick re-confirm or reply "pass".)
result: blocked
blocked_by: other
reason: "Deferred — no claimable keys remaining. Was verified live during the approved 14-06 checkpoint (2026-07-08)."

### 7. Danger-gated reveal, no auto-reveal (re-confirm from live checkpoint)
expected: Opening the claim wizard never reveals a key by itself — the reveal fires only after you explicitly confirm the irreversibility warning. There is no "reveal all" anywhere. (Verified live yesterday; quick re-confirm or reply "pass".)
result: blocked
blocked_by: other
reason: "Deferred — no unrevealed keys remaining. Was verified live during the approved 14-06 checkpoint (2026-07-08)."

### 8. Sync does not churn Keys waiting through intermediate states
expected: A Humble sync/refresh updates key rows to their final categorization without visibly loading ALL keys into Keys waiting first and then progressively removing/recategorizing them.
result: issue
reported: "issue 1, now refresh loads all the keys into key waiting and then removes / categorises and you end up at the expected state."
severity: minor

## Summary

total: 8
passed: 3
issues: 1
pending: 0
skipped: 1
blocked: 3

## Gaps

- truth: "A locally-marked redeemed key keeps its 'Redeemed {date}' + 'Undo' affordance in Keys waiting after a Humble sync (CR-01 fix)"
  status: resolved
  resolved_by: "14-07 gap closure (c55db55a..d0258912) + fix commits 5d111070/e4fc3b3a/88f53fd5; human-retested pass 2026-07-09"
  reason: "User reported: fail, after sync changes to redeemed. Resident Evil Village"
  severity: major
  test: 2
  root_cause: "Shared root cause with test 3 — see diagnosis below. classifyTpk tier 2 (src/backend/humble/classify.ts:37-38) maps server redeemed_key_val presence to REDEEMED and beats the local-mark tier (line 45), so the CR-01 pending flag (which only sets when the LOCAL tier produced the verdict: `state === 'REDEEMED' && !redeemedKeyValuePresent && locallyRedeemed`, classify.ts:365-373) never fires once the server has the key value — which is ALWAYS true after a GameLib reveal. Undo disappears on the first sync."
  artifacts: ["src/backend/humble/classify.ts:31-51 (classifyTpk 5-tier precedence)", "src/backend/humble/classify.ts:365-373 (CR-01 pending flag, excluded when redeemedKeyValuePresent)", "src/backend/humble/library.ts (selectKeysWaiting / getClaimAnnotations)"]
  missing: ["Semantic realignment: server redeemed_key_val presence means REVEALED in Humble's model (the reveal endpoint is literally /humbler/redeemkey), not Steam-activated. REDEEMED must be a local-only overlay (Mark as redeemed / Undo), never derivable from server data."]

- truth: "A revealed-but-unredeemed key keeps 'Revealed {date}' + 'Finish activation' in Keys waiting after a Humble sync (WR-02 fix)"
  status: resolved
  resolved_by: "14-07 gap closure + fix commits; human-retested pass 2026-07-09"
  reason: "User reported: Californium, revealed not redeemed, refresh changed to redeemed."
  severity: major
  test: 3
  root_cause: "Same root cause: classifyTpk tier 2 conflates Humble-revealed with Steam-redeemed. Humble server truth has only two non-expired states (key value absent = UNREVEALED, key value present = REVEALED); it cannot know about Steam activation. Phase 11 decision D-30 ('server truth wins', locked precedence) was made under this misreading, so Phase 14's CR-01/WR-02 fixes routed AROUND tier 2 instead of correcting it, and every sync after a reveal reclassifies the key REDEEMED, clobbering local claim state."
  artifacts: ["src/backend/humble/classify.ts:37-38 (redeemedKeyValuePresent -> REDEEMED — the misalignment)", "src/backend/humble/library.ts (WR-02 selectKeysWaiting keep-visible workaround)"]
  missing: ["Aligned state model: SERVER truth -> UNREVEALED/REVEALED/UNREDEEMABLE only. LOCAL overlay -> REDEEMED via Mark-as-redeemed, always undoable. This deletes the CR-01 pending-flag machinery and the WR-02 keep-visible workaround. D-30 precedence needs formal amendment (user-approved direction, this UAT session). Design decision for planning: previously-revealed-on-Humble keys will surface as REVEALED/'Finish activation' in Keys waiting — corroboration option: steam-user licenses expose payment_method=EPaymentMethod.ActivationCode + time_created (key-activated vs purchased), enabling confident auto-mark-redeemed (still undoable); at minimum scope this as a follow-up, with ownedElsewhere note (D-72) as the interim signal."]

## Diagnosis Notes

Both gaps share ONE root cause, diagnosed conversationally during this UAT session with the user and confirmed by direct code read (no debug agent needed):

- Humble's real model: UNREVEALED --(POST /humbler/redeemkey — Humble names reveal "redeem")--> key value visible (redeemed_key_val populated). Humble has no knowledge of Steam activation; "redeemed on Steam" exists only as GameLib-local knowledge.
- GameLib's classifyTpk treats redeemed_key_val presence as REDEEMED (Steam-activated) — a category error baked into Phase 11's D-30 precedence before the reveal endpoint had ever been called live.
- Fix direction (user-approved): remap tier 2 to REVEALED; make REDEEMED local-only and permanently undoable; delete the now-unnecessary CR-01/WR-02 compensation code; amend D-30's rationale.

- truth: "A Humble sync updates Keys waiting to final categorization without visible intermediate churn (all keys appearing then progressively removing/recategorizing)"
  status: failed
  reason: "User reported: refresh loads all the keys into Keys waiting and then removes/categorises until the expected state is reached. End state correct; churn is transient."
  severity: minor
  test: 8
  root_cause: "Hypothesis (code-evidenced, not yet confirmed): library.ts broadcasts humbleKeysUpdated after EVERY committed order (D-26 progressive fill - library.ts:798), and the classifier v4->v5 bump forced reclassifyAll over every cached order, so the renderer receives many intermediate snapshots where later orders are still unclassified/stale and ownership dedup has not yet recomputed - keys transit Keys waiting before settling. Related: .planning/debug/humble-keys-empty-list-flashing-sync.md (awaiting_human_verify) documents the same D-26 progressive-fill broadcast causing sync flicker (S2). May be largely a one-time migration artifact: normal syncs skip frozen orders (D-24), so churn should be far smaller after the v5 reclassification completes."
  artifacts: ["src/backend/humble/library.ts:779-798 (per-order humbleKeysUpdated broadcast during sync)", ".planning/debug/humble-keys-empty-list-flashing-sync.md"]
  missing: ["Decision: accept as one-time migration artifact (verify by re-running a normal sync) vs. batch/defer humbleKeysUpdated broadcasts until sync completes (or debounce), trading progressive fill (D-26) for a stable list."]
