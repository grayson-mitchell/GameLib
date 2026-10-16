---
phase: 12-ownership-dedup
verified: 2026-07-07T10:00:00Z
status: passed
score: 22/22 must-haves verified
overrides_applied: 0
deferred:
  - truth: "A Humble Steam key marked owned_elsewhere does not appear as a claimable key in \"Keys waiting\" (ROADMAP SC1, second clause)"
    addressed_in: "Phase 13"
    evidence: "Phase 13 goal: 'Users can see at a glance which Humble keys are available to claim...'; Phase 13 SC1: 'A \"Keys waiting\" view lists all unowned, unredeemed Humble keys...'. No \"Keys waiting\" view exists anywhere in src/ yet (grep for KeysWaiting/keys waiting returns nothing) — the view itself is Phase 13's deliverable. Phase 12's actual responsibility (setting `ownedElsewhere`/`matchConfidence` correctly so Phase 13 can filter on it) is fully verified."
---

# Phase 12: Ownership Dedup Verification Report

**Phase Goal:** Every Humble key is cross-referenced against the Steam library so already-owned games are identified before any user action, and Humble Steam keys already redeemed appear on their existing Steam entry rather than as duplicates (exact AppID match + 85%+ fuzzy-name fallback, owned-badges with fuzzy-only override, redeemed-key collapse into a Humble-origin annotation on the Steam game-details page). Requirements: HDEDUP-01, HDEDUP-02.

**Verified:** 2026-07-07T10:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

**Note on human-verify checkpoint:** Plan 12-05's Task 3 (blocking human-verify covering badges, override persistence, annotation, and keep-last-known-on-Steam-logout in the running app) was completed and approved by the user on 2026-07-07. Per instruction, this is treated as human-verified and is not re-flagged as an outstanding human-verification item below.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | (ROADMAP SC1) A Humble Steam key for a game already in the Steam library is marked `owned_elsewhere` | ✓ VERIFIED | `dedup.ts:recomputeOwnership` sets `ownedElsewhere: true`/`matchConfidence` correctly; `library.test.ts` "recompute after sync" test asserts this end-to-end; 22/22 `dedup.test.ts` + 56/56 `library.test.ts` pass |
| 1b | ...and does not appear as a claimable key in "Keys waiting" | ⏭ DEFERRED | No "Keys waiting" view exists in the codebase — it is Phase 13's deliverable (see `deferred` in frontmatter). Phase 12's job (setting the flag Phase 13 will filter on) is verified |
| 2 | (ROADMAP SC2) A Humble Steam key already redeemed into Steam appears as an annotation on the existing Steam library entry rather than as a separate Humble entry | ✓ VERIFIED | `HumbleOriginInfo.tsx` renders `t('info.humbleOrigin', ...)` when a REDEEMED key's `steamAppId === gameInfo.app_name`; mounted in `GamePage/index.tsx:568`; 4/4 component tests pass |
| 3 | (ROADMAP SC3) AppID primary, 85%+ fuzzy fallback, DLC titles do not false-positive match base game | ✓ VERIFIED (with WARNING) | `dedup.ts` exact-tier-final + fuzzy 85% + `isDlcFalsePositiveRisk` guard; `"Game X: Season Pass"` vs `"Game X"` and `"Batman"` vs `"Batman: Arkham Knight"` both correctly rejected (tests pass). **Warning:** the fuzzy tier also produces verified false positives for non-DLC numeric-sequel pairs (see Anti-Patterns WR-02) — outside the literal SC wording (which only requires the DLC guard) but contrary to the phase's own stated design principle (D-44: "fuzzy false-positives are the dangerous error") |
| 4 | (12-01) HumbleKey rows carry `steamAppId`/`ownedElsewhere`/`matchConfidence` | ✓ VERIFIED | `src/common/types/humble.ts` interface extended exactly as specified |
| 5 | (12-01) Steam-platform key's AppID captured from live tpk during classification | ✓ VERIFIED | `classify.ts:306-311` reads `tpk.steam_app_id`, stringifies for `platform === 'steam'` only |
| 6 | (12-01) Version bump forces one-time re-fetch backfilling `steamAppId` on frozen/cached orders | ✓ VERIFIED | `HUMBLE_CLASSIFIER_VERSION = 3`; `library.test.ts` "classifier version" backfill test passes |
| 7 | (12-02) Exact AppID match is final, no fuzzy second-guessing (D-44) | ✓ VERIFIED | `dedup.ts:148-152` — `steamAppId` present branch never falls through to fuzzy |
| 8 | (12-02) No-`steamAppId` keys fall through to 85%+ fuzzy fallback (D-45) | ✓ VERIFIED | `dedup.ts:153-156`; cross-platform (GOG-key) fuzzy match test passes |
| 9 | (12-02) UNPICKED pseudo-entries excluded from matching (D-27) | ✓ VERIFIED | `dedup.ts:143-145`; dedicated test passes |
| 10 | (12-03) "Not the same game" override persists keyed by `machine_name`, survives disconnect/reconnect (D-43) | ✓ VERIFIED | `humbleOwnershipOverrideStore` added, exempted from `user.ts disconnect()`; `electronStores.test.ts` proves survival against the real `CacheStore` |
| 11 | (12-03) Ownership recomputes at end of every Humble sync against full Steam owned-apps list, re-pushed to renderer | ✓ VERIFIED | `library.ts recomputeOwnership()` called at end of `runSync()`; `sendFrontendMessage('humbleKeysUpdated', ...)` confirmed as a distinct post-mutation push |
| 12 | (12-03) Steam disconnected/empty → existing ownership flags kept at last-known values, never zeroed (D-48) | ✓ VERIFIED (with WARNING) | Double-gate (`SteamUser.isLoggedIn()` AND non-empty `steamLibraryStore`) makes the *passive* recompute pass a no-op — verified by test. **Warning:** the *explicit* override write path (`setOwnershipOverride`/`clearOwnershipOverride`) silently has no persisted effect while this same gate blocks it (see Anti-Patterns WR-03) — a different code path than the keep-last-known guarantee itself, but a related gap in the same area |
| 13 | (12-03) Pre-Phase-12 cached orders re-fetch once and backfill `steamAppId` | ✓ VERIFIED | Same backfill test as #6, exercised through the full wired path |
| 14 | (12-04) Renderer can fire a "Not the same game" override via typed `humble:*` IPC | ✓ VERIFIED | `ipc.ts`, `ipc_handler.ts`, `preload/api/humble.ts` all wired; `HumbleKeyRow` calls `window.api.humbleSetOwnershipOverride` |
| 15 | (12-04) Backend rejects override on non-fuzzy (exact) match server-side (D-42) | ✓ VERIFIED | `ipc_handler.ts:39-54` explicit `matchConfidence !== 'fuzzy'` reject+log guard, in addition to `dedup.ts`'s own gate |
| 16 | (12-04) Ownership recomputes on Steam-inclusive library refresh; `steam/library.ts` stays Humble-unaware (D-47) | ✓ VERIFIED | `main.ts:979-986` calls `HumbleLibrary.recomputeOwnership()`; `grep humble` in `steam/library.ts` returns 0 matches |
| 17 | (12-05) Matched row shows "Owned on Steam" (exact) / "Likely owned on Steam" (fuzzy), fact-only, no re-sort/dim | ✓ VERIFIED | `HumbleKeyRow/index.tsx:67-87`; no `groupKeys`/`GROUP_ORDER` import changes |
| 18 | (12-05) Fuzzy-matched row (only) shows "Not the same game" override affordance firing the IPC | ✓ VERIFIED | `HumbleKeyRow/index.tsx:75-85` — guarded by `matchConfidence === 'fuzzy'` |
| 19 | (12-05) REDEEMED confirmed-matched key shows Humble-origin annotation on Steam details info tab | ✓ VERIFIED | `HumbleOriginInfo.tsx` test 1 |
| 20 | (12-05) REDEEMED key with no confirmed match renders no annotation, no mismatch flag (D-37) | ✓ VERIFIED | `HumbleOriginInfo.test.tsx` test 4 |
| 21 | (12-05) REDEEMED key with confirmed match stays visible on Humble Keys page as a normal REDEEMED row — never hidden (D-36) | ✓ VERIFIED | `HumbleKeyRow` renders unconditionally regardless of match status; no filtering/hiding logic exists anywhere in the Keys list render path |
| 22 | Human-verify checkpoint (badges, override persistence, annotation, keep-last-known on Steam logout in the live app) | ✓ VERIFIED (human, prior approval) | Plan 12-05 Task 3 — user-approved 2026-07-07, per task instructions treated as resolved, not re-flagged |

**Score:** 22/22 truths verified (1 sub-clause of truth #1 deferred to Phase 13, tracked separately, does not count against this phase's score)

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | "Keys waiting" view excludes owned_elsewhere keys | Phase 13 | Phase 13 goal/SC1 explicitly build the "Keys waiting" view; it does not exist yet in the codebase |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/common/types/humble.ts` | `HumbleKey` extended with `steamAppId?`/`ownedElsewhere`/`matchConfidence` | ✓ VERIFIED | Fields present, `HumbleKeyState` union unchanged (5 states) |
| `src/backend/humble/constants.ts` | `HUMBLE_CLASSIFIER_VERSION=3`, `HUMBLE_FUZZY_MATCH_THRESHOLD=0.85` | ✓ VERIFIED | Both constants present exactly |
| `src/backend/humble/classify.ts` | `steamAppId` capture in `classifyOrder` | ✓ VERIFIED | No new imports; per-tpk try/catch preserved |
| `src/backend/humble/dedup.ts` | Pure two-tier matcher: `recomputeOwnership`, `fuzzyMatch`, `titleSimilarity`, `isDlcFalsePositiveRisk`, `normalizeTitle` | ✓ VERIFIED | 163 lines, all 5 exports present, no store/IPC import |
| `src/backend/humble/electronStores.ts` | `humbleOwnershipOverrideStore`, disconnect-exempt | ✓ VERIFIED | Present, exported, exemption comment in `user.ts` |
| `src/backend/humble/library.ts` | `recomputeOwnership()`/`setOwnershipOverride`/`clearOwnershipOverride` wired into `runSync()` + exported | ✓ VERIFIED | Double-gated, re-pushes `humbleKeysUpdated` |
| `src/common/types/ipc.ts` | `humbleSetOwnershipOverride`/`humbleClearOwnershipOverride` channel types | ✓ VERIFIED | Present in `AsyncIPCFunctions` |
| `src/backend/humble/ipc_handler.ts` | Override handlers with server-side fuzzy validation | ✓ VERIFIED | Explicit reject+log guard before delegating |
| `src/preload/api/humble.ts` | Preload bridges for both override channels | ✓ VERIFIED | `makeHandlerInvoker` exports present |
| `src/backend/main.ts` | Steam-refresh recompute trigger in `refreshLibrary` handler | ✓ VERIFIED | Gated on `steam \| all \| undefined`, try/catch-wrapped |
| `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx` | Owned badge + fuzzy-only override affordance | ✓ VERIFIED | Renders badge/override exactly per spec |
| `src/frontend/screens/Game/GamePage/components/HumbleOriginInfo.tsx` | Redeemed-only Steam-side Humble-origin annotation | ✓ VERIFIED | Mounted in `GamePage/index.tsx`, 4/4 tests pass |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `classify.ts` | `HumbleKey.steamAppId` | object literal push in `classifyOrder` | ✓ WIRED | Confirmed at line 321 |
| `constants.ts` | `library.ts reclassifyAll` | `HUMBLE_CLASSIFIER_VERSION` mismatch triggers re-fetch | ✓ WIRED | Backfill test passes |
| `dedup.ts` | `fastest-levenshtein distance()` | import | ✓ WIRED | `import { distance } from 'fastest-levenshtein'`; package installed v1.0.16, confirmed via legitimacy-gate summary and `node_modules` inspection |
| `dedup.ts recomputeOwnership` | `HumbleKey.ownedElsewhere`/`matchConfidence` | returns mutated key rows | ✓ WIRED | Confirmed by unit tests |
| `library.ts` | `dedup.ts recomputeOwnership` | import + call after sync | ✓ WIRED | `import { recomputeOwnership as dedupRecomputeOwnership } from './dedup'` |
| `library.ts` | `humbleKeysUpdated` frontend message | re-push after dedup mutation | ✓ WIRED | Confirmed distinct push at `library.ts:329` |
| `library.ts recomputeOwnership` | `steamLibraryStore.get('games', [])` | reads Steam owned-apps, gated on connectivity | ✓ WIRED | Confirmed at `library.ts:308-312` |
| `main.ts refreshLibrary handler` | `HumbleLibrary.recomputeOwnership()` | called after steam\|all\|undefined refresh | ✓ WIRED | Confirmed at `main.ts:979-986` |
| `ipc_handler.ts` | `HumbleLibrary.setOwnershipOverride` | `addHandler` delegation | ✓ WIRED | Confirmed with fuzzy-guard in front |
| `HumbleOriginInfo.tsx` | `humble.keys` context | find REDEEMED key where `steamAppId === gameInfo.app_name` | ✓ WIRED | Confirmed at line 28-30 |
| `HumbleKeyRow/index.tsx` | `window.api.humbleSetOwnershipOverride` | override affordance onClick (fuzzy rows only) | ✓ WIRED | Confirmed at line 79-81 |
| `GamePage/index.tsx` | `HumbleOriginInfo` | mounted in the info TabPanel | ✓ WIRED | Confirmed at line 568, barrel import at line 61 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `HumbleKeyRow` badge | `humbleKey.ownedElsewhere`/`matchConfidence` | `humble.keys` context ← `humbleGetKeys` IPC ← `humbleLibraryStore` (mutated by `recomputeOwnership()` against real `steamLibraryStore.get('games', [])`) | Yes | ✓ FLOWING |
| `HumbleOriginInfo` annotation | `matchedKey` (found via `.find`) | Same `humble.keys` context, real REDEEMED rows with real `steamAppId` from live Humble API captured at classify time | Yes | ✓ FLOWING |

Both renderer surfaces trace back to real backend computation (`dedup.ts` against `steamLibraryStore`), not static/hardcoded fallbacks.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full humble + frontend jest suites pass | `npx jest src/backend/humble src/frontend --silent` | 10 suites, 258 tests, all pass | ✓ PASS |
| `tsc --noEmit` clean across whole project | `npx tsc --noEmit -p tsconfig.json` | 0 errors | ✓ PASS |
| DLC guard rejects documented false-positive pairs | `dedup.test.ts` "dlc" describe block | `"Game X: Season Pass"` vs `"Game X"` and `"Batman"` vs `"Batman: Arkham Knight"` both rejected | ✓ PASS |
| **Sequel false-positive probe (verifier-authored, not in test suite)** | Ad-hoc jest run of `titleSimilarity`/`fuzzyMatch` against `"Borderlands 2"`/`"Borderlands 3"`, `"Darksiders II"`/`"Darksiders III"`, `"The Walking Dead Season 1"`/`"...Season 2"` | All three score ≥0.85 (0.923, 0.929, 0.96) and `fuzzyMatch` returns `true` | ✗ FAIL (confirms REVIEW.md WR-02 is real and unresolved) |
| `fastest-levenshtein` installed as claimed | `node_modules/fastest-levenshtein/package.json` | version 1.0.16 present | ✓ PASS |
| All claimed commit hashes exist in git history | `git cat-file -e <hash>` for 13 commits across all 5 plans | All resolve | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` files or probe references found in this phase's PLAN/SUMMARY files. Step 7c: SKIPPED (no probes declared for this phase).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| HDEDUP-01 | 12-01, 12-02, 12-03, 12-04, 12-05 | Every key is cross-referenced against the Steam library (AppID-first, 85%+ fuzzy fallback) to set `owned_elsewhere` | ✓ SATISFIED | `dedup.ts` two-tier matcher, wired into `library.ts` + `main.ts` + IPC + UI; all layers tested and traced |
| HDEDUP-02 | 12-01, 12-03, 12-05 | A Humble Steam key already redeemed into Steam collapses onto the existing Steam library entry (annotated with Humble origin) instead of appearing as a duplicate | ✓ SATISFIED | `HumbleOriginInfo.tsx` + version-bump backfill mechanism, both verified |

**Documentation lag (non-blocking):** `.planning/REQUIREMENTS.md` still lists both `HDEDUP-01` and `HDEDUP-02` as unchecked `[ ]` with status "Pending" (lines 71-72, 150-151), even though implementation evidence fully satisfies both. Per the plan summaries' own Orchestrator Notes, this file is deliberately left untouched by worktree agents and is the orchestrator's responsibility to update once the phase verifies — flagging here so it isn't missed at phase close-out.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/backend/humble/classify.ts` | 306-311 | Falsy/non-numeric `steam_app_id` values (`''`, `0`, `NaN`) are still captured as a truthy `steamAppId` string, permanently disabling BOTH match tiers for that key (no fuzzy fallback since `steamAppId !== undefined`) | ⚠️ WARNING | Real, unfixed — flagged by the phase's own code review (WR-01), never remediated. Requires a malformed/edge-case live API payload to trigger |
| `src/backend/humble/dedup.ts` | 84-114 | `titleSimilarity`/`fuzzyMatch` score numeric-sequel pairs (e.g. "Borderlands 2" vs "Borderlands 3") ≥0.85 with no guard — verified empirically by this verifier (see Behavioral Spot-Checks) | ⚠️ WARNING | Real, unfixed — flagged by code review (WR-02), never remediated. Contradicts the phase's own stated design principle (D-44: "fuzzy false-positives are the dangerous error"). Outside the *literal* ROADMAP SC3 wording (which only requires the DLC guard), but a genuine correctness gap in the "85%+ fuzzy-name fallback" mechanism that Phase 14's C2 hard-block guard will read |
| `src/backend/humble/library.ts` | 338-350 | `setOwnershipOverride`/`clearOwnershipOverride` write to `humbleOwnershipOverrideStore` then call `recomputeOwnership()`, which double-gates on Steam connectivity — while Steam is disconnected, the override write has literally no visible or persisted effect (badge doesn't clear, no renderer push) | ⚠️ WARNING | Real, unfixed — flagged by code review (WR-03), never remediated. A UX dead-click in a specific offline scenario; the human-verify checkpoint tested override-then-restart and override-then-Humble-reconnect, not "click override while Steam itself is currently disconnected" |
| `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx` | 79-81 | `humbleClearOwnershipOverride` is fully wired end-to-end (IPC, handler, library method, tests) but has zero frontend callers — no UI path exists to undo a "Not the same game" override | ⚠️ WARNING | Real, unfixed — flagged by code review (WR-04). A misclick permanently suppresses a correct match (D-43 persists it forever across disconnect) with no in-app recovery |
| `src/backend/humble/dedup.ts` | 30-43, 66-76 | Edition-suffix stripping (`new RegExp('\\b'+suffix+'\\b','g')`) is unanchored (matches mid-string, not just tail); `collection` in `EDITION_SUFFIXES` means a Humble "X Collection" bundle can fuzzy-match an owned base "X" at similarity 1.0 | ℹ️ INFO | Code-review finding (IN-02), not independently re-verified by this pass beyond confirming the code is unchanged since review |
| `src/backend/humble/library.ts` | 316-323 | `recomputeOwnership()` calls `humbleLibraryStore.set()` for every cached order on every recompute, even when nothing changed | ℹ️ INFO | Code-review finding (IN-01), performance-only, not independently re-verified |
| `src/backend/humble/classify.ts` | 263-266 | `machineName` falls back to a positional key (`` `${gamekey}:${keys.length}` ``) when `machine_name` is absent, which the now-forever-persisted override store also keys on | ℹ️ INFO | Code-review finding (IN-03), not independently re-verified |
| `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx` | 79-81 | Override `onClick` discards the returned promise from `window.api.humbleSetOwnershipOverride` with no `.catch()` | ℹ️ INFO | Code-review finding (IN-04), consistent with the project's existing fire-and-forget convention elsewhere |
| `src/frontend/jest.config.js` | 27 | `testMatch` only matches `*.test.tsx`, would silently skip a future `*.test.ts` (non-JSX) frontend test file | ℹ️ INFO | Code-review finding (IN-05), confirmed still present |

No `TBD`/`FIXME`/`XXX` debt markers found in any file modified by this phase. No stub implementations (`return null`/empty handlers/hardcoded empty arrays feeding render) found in the reviewed set — every code path traced back to real data or real store I/O.

### Human Verification Required

None outstanding. Plan 12-05's Task 3 blocking human-verify checkpoint (owned badges exact/fuzzy, fuzzy-only override persisting + surviving Humble disconnect/reconnect, redeemed-only Steam annotation, keep-last-known on Steam logout) was completed and approved by the user on 2026-07-07, per the SUMMARY's "Human Verification (Task 3 — approved 2026-07-07)" section and the task instructions for this verification pass.

### Gaps Summary

No BLOCKER-level gaps. All ROADMAP success criteria and all five plans' `must_haves` (truths, artifacts, key links) are implemented, wired, and covered by passing tests (258/258 across 10 jest suites spanning backend + the newly-established frontend jest project), with `tsc --noEmit` clean and every claimed commit verified present in git history.

Four WARNING-level anti-patterns carried forward unaddressed from the phase's own code review (`12-REVIEW.md`, `status: issues_found`, 0 critical / 4 warning / 5 info) were independently re-verified by this pass (WR-02's false-positive claim was empirically reproduced against the shipped `fastest-levenshtein` build). None of them violate the *literal* wording of a ROADMAP success criterion or a PLAN `must_have`, so none are classified as blockers — but WR-02 (fuzzy false-positive on sequel titles) and WR-03 (override is a silent no-op while Steam is disconnected) both touch the `ownedElsewhere`/`matchConfidence` overlay that Phase 14's C2 hard-block guard is planned to consume, so they are surfaced here for an explicit accept/defer decision rather than silently carried forward.

**Recommendation:** Before Phase 14 (Guided Claim Flow) begins consuming `ownedElsewhere` for its hard-block guard, either (a) accept WR-02/WR-03 via an explicit override entry in this file with a reason, or (b) open a small remediation plan addressing the trailing-numeral guard (WR-02) and the offline-override direct-write fallback (WR-03). WR-01 and WR-04 are lower-severity edge cases that can reasonably wait.

One item (the "Keys waiting" exclusion clause of ROADMAP SC1) is deferred to Phase 13, which owns building that view — not a gap in Phase 12's own scope.

---

_Verified: 2026-07-07T10:00:00Z_
_Verifier: Claude (gsd-verifier)_
