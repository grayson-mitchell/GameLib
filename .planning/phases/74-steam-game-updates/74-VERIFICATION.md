---
phase: 74-steam-game-updates
verified: 2026-11-13T00:00:00Z
status: gaps_found
score: 5/8 must-haves verified
overrides_applied: 0
gaps:
  - truth: "Play on a stale bridge game shows ONE prompt (Update now / Play anyway / Don't ask again) and each choice does what it says"
    status: failed
    severity: BLOCKER (must-fix)
    reason: "Two prompts stack (inherited Heroic frontend prompt, then backend gate). The backend 3-button showMessageBox falls back to OK-only, and OK = response 0 = Update now, overriding the user's Play anyway. Play anyway and Don't ask again are unreachable."
    artifacts:
      - path: "src-tauri/src/dialogs.rs:151"
        issue: "custom buttons rendered only when buttons.len() == 2; 3 buttons fall through to OK-only"
      - path: "src/backend/storeManagers/steam/updateLaunchPrompt.ts:57-70"
        issue: "passes 3 buttons; default response 0 = Update now"
      - path: "src/frontend/helpers/library.ts:177"
        issue: "inherited gamepage:box.update prompt duplicates the backend gate"
    missing:
      - "Single prompt: drop the duplicate (suppress the inherited frontend prompt for Steam bridge games, or drop the backend gate)"
      - "Either support 3 buttons in dialogs.rs (rfd YesNoCancelCustom) or restructure to 2 buttons plus a separate ack path; an unknown/fallback result must map to Play anyway (never to Update now)"
  - truth: "A committed delta is reported as done and its GID-keyed follow-ups run (WR-06)"
    status: failed
    severity: BLOCKER (must-fix)
    reason: "If signal.aborted is set when Rust returns completed, install.ts rewrites the result to cancelled; shim re-handover, redists, DRM verdicts and cache invalidation are skipped on an already-updated tree (shim may already be replaced)."
    artifacts:
      - path: "src/backend/storeManagers/steam/depotRust/install.ts:~266-274"
        issue: "abort wins over committed outcome"
      - path: "src/backend/storeManagers/steam/updateBridge.ts:150-153"
        issue: "same rewrite on the update path"
    missing:
      - "When outcome.delta?.committed is true, report done and run the follow-ups regardless of signal.aborted"
  - truth: "An update never deletes content it should keep (WR-01)"
    status: failed
    severity: BLOCKER (must-fix, potential user-content deletion)
    reason: "Any ACF-installed depot not in refs.depots is sent to Rust as retired and its files deleted. refs.depots omits depots for skippedDepots (EResult 40), language, OS or DLC ownership, so a transient or partial ownership answer or language change deletes DLC/language content. Retired key is fetched with ownerAppId=appId (wrong for DLC/shared depots)."
    artifacts:
      - path: "src/backend/storeManagers/steam/depotRust/install.ts:200-224"
        issue: "retired = installed minus selected, not 'dropped from the branch depot list'"
    missing:
      - "Retire only depots absent from the branch's PICS depot list for this build; exclude refs.skippedDepots and selector-skipped depots; use the depot's real owner app id"
  - truth: "Launch is blocked or clearly handled while a bridge update is queued or committing (WR-05)"
    status: failed
    severity: must-fix
    reason: "A queued or in-flight update returns 'launch'; during commit the ACF still has bit 4, so Play can start the game on a half-renamed tree."
    artifacts:
      - path: "src/backend/storeManagers/steam/updateLaunchPrompt.ts:51-55"
        issue: "queued -> 'launch'"
    missing:
      - "When an update is queued or running, notify and abort the launch; key prompt suppression on the ack only"
  - truth: "After Steam finishes a registered update, GameLib clears the badge and Updating state promptly (UAT item 12, WR-04)"
    status: failed
    severity: must-fix (minor in UAT, but a stated phase behaviour)
    reason: "Update-state cache has no TTL/ACF re-read; poll quiet-ends at 40 ticks without invalidating the cache when buildid was already current; SteamUpdateInfo refetches only on [appName, hasUpdate]."
    artifacts:
      - path: "src/backend/storeManagers/steam/updateInfo.ts:33-44"
        issue: "stale last-known cache"
      - path: "src/backend/storeManagers/steam/updateDetection.ts:140"
        issue: "no invalidation on completion"
      - path: "src/backend/storeManagers/steam/library/updatePollOnce.ts:106-118"
        issue: "completion rule misses an already-current game; quiet end does not invalidate"
    missing:
      - "Recompute registered state from the ACF per call; invalidate cache when the poll ends; refetch in the frontend on the 'done' transition; treat buildid already == target as immediate completion"
  - truth: "Resuming a paused bridge update keeps downloaded progress (UAT item 6a, WR-03)"
    status: failed
    severity: can-defer (minor; functional, costs bandwidth) unless large-update pause is a goal
    reason: "Temps are deleted at run start and on cancel; pause = abort, so resume re-downloads the whole delta (70 MB lost on a 101 MB delta; ~916 MiB on Manor Lords)."
    artifacts:
      - path: "src-tauri/crates/gamelib-depot/src/delta.rs:1273-1287"
        issue: "temps discarded at start"
      - path: "src-tauri/crates/gamelib-depot/src/delta.rs:1527-1535"
        issue: "temps discarded on cancel"
    missing:
      - "Keep SHA-verified temps on cancel; reuse on resume when size and re-hash match; delete only on error or target-build change"
  - truth: "Pre-click size estimate is a usable guide (UAT item 5, WR-02)"
    status: failed
    severity: should-fix (7x overstatement can deter updates; new-depot under-count can wrongly pass the disk check)
    reason: "unique_chunk_bytes(changed) counts all changed chunks without crediting chunks present in the old manifest; depots with no old GID are omitted from download and peak in TS."
    artifacts:
      - path: "src-tauri/crates/gamelib-depot/src/manifest.rs:88-98"
        issue: "no old-manifest chunk-SHA subtraction"
      - path: "src/backend/storeManagers/steam/depotRust/updateEstimate.ts:117-130"
        issue: "new depots skipped"
    missing:
      - "Subtract old-manifest chunk SHAs; add total_bytes of new depots to download and peak"
  - truth: "Downloads hero shows 'Planning update...' then 'Applying update...' (UAT item 6b, WR-07)"
    status: failed
    severity: can-defer (cosmetic/minor)
    reason: "Planning context never cleared on 'planned'; long pre-job TS work runs under generic status before any stage event."
    artifacts:
      - path: "src/backend/storeManagers/steam/depotRust/progressBridge.ts:45-58"
        issue: "context not cleared; no early TS status"
      - path: "src/backend/downloadmanager/utils.ts:486"
        issue: "hero phase mapping"
    missing:
      - "Emit planning status from TS before the estimate; send plain 'updating' on 'planned'"
  - truth: "Pre-launch 'bounded 3 s' PICS wait is bounded (WR-04b)"
    status: failed
    severity: must-fix (violates a D-05 stated bound; UAT offline pass only exercised fast-fail)
    reason: "anonymousClient.get('update-check') is outside withTimeout (15 s connect), force:true bypasses cache; Play can block ~18 s."
    artifacts:
      - path: "src/backend/storeManagers/steam/updateDetection.ts:231-241"
        issue: "connect not inside the timeout"
    missing:
      - "Wrap connect and getProductInfo in one withTimeout(timeoutMs)"
  - truth: "Auto-update respects on-demand-only authentication and does not re-queue failing updates each refresh (WR-08)"
    status: failed
    severity: must-fix (contradicts the frozen Steam-auth rule); re-queue churn can-defer
    reason: "estimateBridgeUpdate takes acquireAuthenticated(guidedAction 'install') with no user gesture; failing updates re-queue each refresh with an error dialog; detection runs twice per refresh (UAT item 14 saw 3x 'Auto-Updating' log lines)."
    artifacts:
      - path: "src/backend/utils/checkGameUpdates.ts:50-63"
        issue: "unattended authenticated path"
      - path: "src/backend/storeManagers/steam/updateBridge.ts:120-125"
        issue: "guided auth on auto path"
    missing:
      - "Non-interactive auto path (no guided sign-in/no dialog); per-build 'attempted' marker; share one detection result"
  - truth: "Delta fallback only on a definitive old-manifest failure (WR-09)"
    status: failed
    severity: should-fix
    reason: "Any old-manifest load failure (timeout, 5xx, not_signed_in) silently becomes a whole-install reconcile that also drops retired_depots."
    artifacts:
      - path: "src-tauri/crates/gamelib-depot/src/delta.rs:1082-1087"
        issue: "over-broad fallback"
    missing:
      - "Fall back only on definitive unavailable/decode error; propagate transient failures"
  - truth: "Game page makes Update and the update size easy to find (UAT item 1)"
    status: failed
    severity: can-defer (cosmetic; works via inherited status text)
    reason: "No Update button; trigger is clickable status text (GameStatus.tsx:227); size line is in the Info tab (index.tsx:677)."
    artifacts:
      - path: "src/frontend/screens/Game/GamePage/index.tsx:677"
        issue: "size line off the primary action area"
    missing:
      - "Real Update button; surface size line near status"
  - truth: "i18n and fork-touched-file gates stay green for new keys"
    status: failed
    severity: should-fix (phase added regressions on top of pre-existing red)
    reason: "About 30 new gamelib en keys untranslated; two new fork-touched files not in meta/i18nForkTouchedFiles.json (UAT preamble)."
    artifacts:
      - path: "meta/i18nForkTouchedFiles.json"
        issue: "missing two files"
    missing:
      - "Add the two files; translate or register the ~30 keys per the repo's i18n gate"
deferred: []
---

# Phase 74: Steam game updates Verification Report

**Phase Goal:** GameLib can tell when an installed Steam game has an update and can apply it, for both Steam-registered games and bridge (GameLib-installed) games.
**Verified:** 2026-11-13
**Status:** gaps_found
**Re-verification:** No, initial verification

## Goal Achievement

The core capability exists and works on real hardware: detection and apply both function end to end. The phase is not complete because the live gate's approval condition (items 1-8 and 10-14 pass) was not met, and the code review found several defects that touch the goal (one potential content-deletion, one launch-override, one lost-follow-up).

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Bridge stale game shows update badge and size after Refresh | VERIFIED | UAT 1, 2 pass (Mining Mechs). Size is an upper bound (see WR-02). |
| 2 | Bridge game updates via Rust delta, keeps saves, and still launches via the bridge | VERIFIED | UAT 3, 4, 5 pass: outcome `status=completed acf=4`, only changed files rewritten, strict HELLO+GINIT; Manor Lords genuine DLL swapped to `.gamelib-orig`, shim re-placed. |
| 3 | Registered game shows "Steam will update this game" and Update hands off to Steam | VERIFIED | UAT 10, 11 pass (steam://nav, A1 confirmed). |
| 4 | Registered Update with InstallApp ON completes and GameLib reflects it | FAILED | UAT 12 issue; WR-04 (badge stays until 40-tick timeout). |
| 5 | Check on refresh and before launch is bounded and Play shows one working prompt | FAILED | UAT 7 major (stacked prompts, OK-only fallback = Update now); WR-04b (bound is not real). Offline Play itself passed (UAT 8). |
| 6 | Pause/resume through the download queue | PARTIAL (functional, wasteful) | UAT 6: resume completes but restarts at 0% (WR-03); pass-with-gaps. |
| 7 | Auto-update queues bridge games, not registered (D-01/D-02), without unattended auth | PARTIAL | UAT 14 pass on queueing and D-02; WR-08 shows unattended authenticated logon and repeat passes. |
| 8 | Update never destroys content the new build still needs | FAILED | WR-01 (unselected depot treated as retired; confirmed in code at install.ts:200-224: `selected` from `refs.depots` only). Not exercised live (fixtures have one depot). |

**Score:** 3 fully verified of 8 (the must-have count above says 5/8 counting the two PARTIAL items as not verified would be 3/8; frontmatter lists 5/8 as the generous count of truths with a live pass on their core path: 1, 2, 3, 6, 7). Treat as gaps_found either way.

Items confirmed directly in code, not from the review's word: `src-tauri/src/dialogs.rs:151` (`filter(|b| b.len() == 2)`), `updateLaunchPrompt.ts:51-70` (queued returns 'launch'; three buttons passed), `install.ts:200-224` (retired = installed minus selected, `ownerAppId: appId`).

### Requirements Coverage

| Requirement | Source plans | Status | Evidence |
|-------------|--------------|--------|----------|
| STEAM-01 (Update available on installed Steam game) | 74-04, 05, 08, 11, 12, 13 | PARTIAL | Badge shows for bridge (UAT 1) and registered (UAT 10); completion not reflected (UAT 12); pre-launch bound not real. Stays `[ ]`, correct. |
| STEAM-02 (update a bridge game from GameLib) | 74-01, 02, 06, 07, 10, 13 | PARTIAL | Works live (UAT 3, 5, 6, 14). Blocked from "ready" by WR-01, WR-06, UAT 7. |
| Sub-IDs STEAM-01a/b/c/d, STEAM-02a/b/c/d | plans 01-13 frontmatter | NOT IN REQUIREMENTS.md | Only STEAM-01/02/03 exist in REQUIREMENTS.md (lines 39-41, 86-88). The sub-IDs are plan-local and untracked: no orphan problem, but they cannot be audited against REQUIREMENTS.md. STEAM-03 is Phase 75, not claimed here. |

**Premature completion of STEAM-02:** Plan 74-01 (`74-01-SUMMARY.md:35`, `requirements-completed: [STEAM-02, STEAM-02a]`) delivered only the Rust chunk-level delta core (delta.rs, routing, wire fields); no TS wiring, no user path, no live test existed at that point. Marking STEAM-02 `[x]` (REQUIREMENTS.md:40, traceability line 87 "Complete") after plan 1 of 13 was not justified. Plans 02, 06, 07 and 10 also claim STEAM-02, and 74-13 correctly declared `requirements-completed: []`. Today the live evidence does show a user can update a bridge game from GameLib (UAT 3, 5, 6, 14), so the mark is not contradicted on the narrow words, but the same evidence shows the shipped behaviour is defective (WR-01 content deletion risk, WR-06, UAT 7). Recommendation: revert STEAM-02 to `[ ]` / "Pending" in REQUIREMENTS.md until the must-fix gaps close, then re-mark it. This verifier did not edit REQUIREMENTS.md.

### Anti-Patterns / Probes

No TBD/FIXME/XXX hits in the checked phase files (updateLaunchPrompt.ts, updateBridge.ts, updateDetection.ts, delta.rs). Preflight (cargo tests, clippy ratchet, check:ipc-contract, smoke:sidecar, planning-gates) was reported green by 74-13; not re-run here. Pre-existing test:ci failures (tauriShellSource WR-07, epicOfflineMode 6c, gamelibCatalogParity sl, genI18nGateScope, lintTranslations, x86CallbackWineHarness) are not phase-74 regressions, but the phase added untranslated keys (gap above).

### Review warnings triage

- Must-fix before the phase can close: WR-01, WR-05, WR-06, WR-04 (UAT 12), WR-04b, WR-08 (unattended auth part), UAT 7 stacked prompts.
- Should-fix: WR-02, WR-09, i18n/fork-touched registration, IN-03 (skip retired removals after a rename failure).
- Can-defer: WR-03 (resume keeps temps), WR-07 (hero planning label), WR-08 re-queue churn, WR-10, IN-01, IN-02, item 1 Update button UX, prompt wording for part-downloaded updates, item 15 (Windows hand-off, already a todo).

### Human Verification Required

After gap closure: re-run UAT 7 (prompt choices on a stale Hell Clock or Core Keeper), UAT 12 (InstallApp ON completion), and a multi-depot/DLC bridge game update to prove WR-01 does not delete DLC content. UAT 15 stays deferred to the Windows todo.

### Gaps Summary

Detection and the bridge delta-apply core are real and proven live (Mining Mechs, Manor Lords, Planet Crafter, Core Keeper, All Will Fall). The goal is not yet met cleanly: the Play-time prompt is broken (and can force an update the user declined), a possible content-deletion path exists for multi-depot games, a committed update can skip its follow-ups on an abort race, registered-update completion is not reflected, and the "bounded 3 s" pre-launch check is not bounded. Plan these through `/gsd-plan-phase 74 --gaps`, grouped as: (1) launch gate (UAT 7, WR-05, WR-04b); (2) update correctness (WR-01, WR-06, WR-09, IN-03); (3) registered completion (WR-04); (4) auto-update auth (WR-08); (5) estimate and polish (WR-02, WR-03, WR-07, i18n).

---

_Verified: 2026-11-13_
_Verifier: Claude (gsd-verifier)_
