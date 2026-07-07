---
phase: 13-keys-waiting-giftable-spares-views
verified: 2026-07-07T09:30:00Z
status: gaps_found
score: 6/7 must-haves verified
overrides_applied: 0
gaps:
  - truth: "Keys expiring within 30 days display an expiration urgency badge showing the time remaining (ROADMAP SC #2 / D-62 locked copy)"
    status: failed
    reason: "getUrgencyCountdownParts applies Math.ceil(daysLeft) uniformly for everything >=24h with no dedicated 24h-48h branch. Confirmed by direct execution: a key expiring in 25h, 30h, 36h, or 47h all return { kind: 'days', value: 2 } — the badge reads '2 days left' — when 13-UI-SPEC.md locks 'exactly 1 day left (24h-48h) -> \"1 day left\"'. Only the exact 24.000h instant produces value 1; every other moment in the 24-48h window is wrong by nearly 2x, at precisely the most urgent tier this phase exists to communicate accurately. Independently confirmed in 13-REVIEW.md as Critical CR-01."
    artifacts:
      - path: "src/common/humble/urgencyBadge.ts"
        issue: "getUrgencyCountdownParts (lines 66-83): `const daysLeft = msLeft / MS_PER_DAY; return { kind: 'days', value: Math.ceil(daysLeft) }` has no branch for the locked 24h-48h '1 day left' special case"
      - path: "src/backend/humble/__tests__/urgencyBadge.test.ts"
        issue: "Test titled 'exactly-1-day range yields value 1' (line ~98) asserts `value: 2` for a 30-hour expiration — the test name preserves original intent while the assertion was adjusted to match the buggy implementation, so the suite passes without catching the defect"
      - path: "src/frontend/screens/Humble/Keys/components/UrgencyBadge/index.tsx"
        issue: "The `parts.value === 1` -> 'urgencyOneDayLeft' branch (lines 34-35) is effectively dead code as a result — it can only fire at the exact 24.000000h boundary"
    missing:
      - "getUrgencyCountdownParts must special-case daysLeft < 2 (the 24h-48h window) to return value: 1, per the locked UI-SPEC copy row"
      - "Fix the misleadingly-named 30h test to assert value: 1, and add a boundary test at 48h expecting value: 2 (per 13-REVIEW.md's suggested fix)"
deferred:
  - truth: "Urgency badge colors (danger/warning) confirmed visually on real expiring keys"
    addressed_in: "Pending human UAT (not deferred to a later phase — tracked as an open UAT item)"
    evidence: "13-HUMAN-UAT.md status: partial — the connected test account currently has no keys within 30 days of expiry; re-test when one enters the window. This is a visual-confirmation gap, not a code gap: the tier-selection logic (getUrgencyTier) itself is unit-tested and verified correct by this report."
---

# Phase 13: Keys-Waiting + Giftable-Spares Views Verification Report

**Phase Goal:** Users can see at a glance which Humble keys are available to claim and which can be gifted, sorted by expiration urgency; these views must exist before the claim flow since the C2 guard routes to Giftable Spares
**Verified:** 2026-07-07T09:30:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | "Keys waiting" view lists all unowned, unredeemed keys, soonest-expiring first, then title (ROADMAP SC1 / HVIEW-01) | VERIFIED | `src/common/humble/viewFilters.ts` `selectKeysWaiting`/`compareWaiting` implement D-53/D-56 exactly (excludes ownedElsewhere, excludes generic-platform keys per checkpoint fix in commit `5937925b`, excludes REDEEMED/UNREDEEMABLE); `Waiting/index.tsx` renders the flat list with locked blurb/empty-state copy; 22 passing unit tests cover every state x ownership combination and all three sort scenarios |
| 2 | Keys expiring within 30 days display an expiration urgency badge showing the time remaining (ROADMAP SC2) | FAILED | Tier color logic (danger <=7d, warning <=30d) is correct and tested. But the countdown TEXT is wrong for the entire 24h-48h window: confirmed by direct execution that a 25h/30h/36h/47h expiration all yield "2 days left" instead of the UI-SPEC-locked "1 day left". See gap above (CR-01). |
| 3 | "Giftable spares" view lists owned-elsewhere + UNREVEALED keys and exposes the Humble gift action with one click + an irreversibility warning (ROADMAP SC3 / HVIEW-02) | VERIFIED | `selectGiftableSpares` correctly filters ownedElsewhere && UNREVEALED (REVEALED excluded per D-55); `Spares/index.tsx` renders the D-58 confirm dialog with the exact locked irreversibility copy ("...once redeemed, it's gone for good...") before any external navigation; Cancel does nothing, "Open Humble" calls `humbleRecordGiftLinkOpened` + `openExternalUrl` on the literal static URL. Note: the roadmap SC wording says "copying" the gift link — this was a locked, researched pivot (D-57, documented pre-implementation in 13-RESEARCH.md/13-CONTEXT.md) to a deep-link-open action because no passively-cached gift-link field exists; the intent (one-click gift access with a warning) is preserved. |
| 4 | Opening /humble-keys redirects to /humble-keys/waiting; three real sub-routes exist (D-49/50/51) | VERIFIED | `src/frontend/App.tsx` lines 177-197: parent route with `{ index: true, element: <Navigate to="waiting" replace /> }` and three lazy child routes `waiting`/`spares`/`all` |
| 5 | Urgency badges render in all three tabs, including All-keys grouped rows (D-63) | VERIFIED | `HumbleKeyGroup/index.tsx` imports `getUrgencyTier` and passes `urgencyTier=` on every row it renders (additive-only diff); `Waiting/index.tsx` and `Spares/index.tsx` also pass `urgencyTier` per row; all three route through the same `HumbleKeyRow` -> `UrgencyBadge` |
| 6 | All-keys tab preserves the pre-Phase-13 grouped layout unchanged (D-21 lock / Pitfall 4) | VERIFIED | `All/index.tsx` is a verbatim move of the grouped-list body (`GROUP_ORDER.map` + `groupAndSortKeys` + empty state); `HumbleKeyGroup` diff is additive-only (one `getUrgencyTier` import + prop pass-through, no change to heading/collapse/ordering) |
| 7 | D-42 fuzzy-match override safety valve renders on every fuzzy-matched row across all tabs | VERIFIED | Single shared `HumbleKeyRow` component; owned-badge + "Not the same game" override block (lines 84-104) unchanged, still gated on `matchConfidence === 'fuzzy'`, calls `window.api.humbleSetOwnershipOverride` |

**Score:** 6/7 truths verified (one FAILED — urgency countdown text accuracy)

### Deferred Items

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Urgency badge colors confirmed visually on real expiring keys | Pending human UAT (not a later-phase deferral) | 13-HUMAN-UAT.md records this as `status: partial` — the connected test account has no keys within 30 days of expiry. The underlying `getUrgencyTier` tier-selection logic is unit-tested and independently verified correct in this report (danger/warning boundaries at 7/30 days). This is a visual-confirmation gap only, tracked separately from the CR-01 code defect above, and does not change this report's status determination. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/common/humble/viewFilters.ts` | selectKeysWaiting + selectGiftableSpares | VERIFIED | Both exported, pure, unit-tested (22 tests); GENERIC_KEY_PLATFORM exclusion confirmed live |
| `src/common/humble/urgencyBadge.ts` | getUrgencyTier + getUrgencyCountdownParts + UrgencyTier | VERIFIED (tier) / STUB-LIKE DEFECT (countdown) | Tier logic correct; countdown-parts logic has the CR-01 24h-48h bug |
| `src/backend/humble/electronStores.ts` | humbleGiftedAtStore | VERIFIED | `humble_gifted_at` CacheStore declared, exported, disconnect-survival test passes |
| `src/backend/humble/user.ts` | disconnect carve-out naming humbleGiftedAtStore | VERIFIED | Carve-out comment extended (lines 514-526), no `.clear()` call added |
| `src/backend/humble/library.ts` | recordGiftLinkOpened + getAllGiftedAt | VERIFIED | Both exported from HumbleLibrary object, no recomputeOwnership call |
| `src/backend/humble/ipc_handler.ts` | humbleRecordGiftLinkOpened + humbleGetGiftedAt with server-side validation | VERIFIED | Re-validates `ownedElsewhere && state === 'UNREVEALED'`, logWarning(machineName only)+no-op on mismatch |
| `src/common/types/ipc.ts` | AsyncIPCFunctions signatures | VERIFIED | Both channels declared |
| `src/preload/api/humble.ts` | window.api invokers | VERIFIED | `humbleRecordGiftLinkOpened`/`humbleGetGiftedAt` exported via makeHandlerInvoker (Plan 04's own Rule-3 fix for a Plan 02 gap) |
| `src/frontend/App.tsx` | nested humble-keys route table | VERIFIED | index redirect + waiting/spares/all children |
| `src/frontend/screens/Humble/Keys/index.tsx` | parent shell: guard + header + tab nav + Outlet + counts | VERIFIED | Contains `<Outlet />`, three `NavLink`s, `humbleLoginPath` guard, `selectKeysWaiting`/`selectGiftableSpares` counts |
| `src/frontend/screens/Humble/Keys/All/index.tsx` | verbatim D-21 grouped list | VERIFIED | Contains GROUP_ORDER, HumbleKeyGroup, verbatim structure |
| `src/frontend/screens/Humble/Keys/Waiting/index.tsx` | HVIEW-01 flat list | VERIFIED | selectKeysWaiting import, flat `<ul>`, locked blurb/empty-state copy |
| `src/frontend/screens/Humble/Keys/Spares/index.tsx` | HVIEW-02 full gift view | VERIFIED | selectGiftableSpares import, gift dialog, humbleGetGiftedAt fetch, static GIFT_URL constant (no interpolation) |
| `src/frontend/screens/Humble/Keys/components/UrgencyBadge/index.tsx` | presentational badge | VERIFIED (renders) / defect inherited from urgencyBadge.ts | Returns null on tier/expiration null; otherwise renders locked copy — copy is wrong for 24-48h due to upstream bug |
| `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx` | urgencyTier + giftAction optional props | VERIFIED | Both props rendered additively; D-42 override block byte-for-byte preserved |
| `src/frontend/screens/Humble/Keys/components/HumbleKeyGroup/index.tsx` | per-row urgencyTier computation | VERIFIED | `getUrgencyTier` imported and passed on every row, zero change to heading/collapse/ordering |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `App.tsx` | `Keys/Waiting`, `Keys/Spares`, `Keys/All` | lazy child route imports | WIRED | All three resolve; `pnpm codecheck` exits 0 |
| `Waiting/index.tsx` | `common/humble/viewFilters.ts` | selectKeysWaiting import | WIRED | Confirmed import + call |
| `HumbleKeyRow` | `common/humble/urgencyBadge.ts` | UrgencyBadge fed by getUrgencyTier prop | WIRED | Confirmed |
| `HumbleKeyGroup` | `common/humble/urgencyBadge.ts` | getUrgencyTier computed per grouped row | WIRED | Confirmed, additive only |
| `Spares/index.tsx` | `window.api.humbleGetGiftedAt` | useEffect fetch on mount | WIRED | Confirmed, with cancelled-flag guard |
| `Spares/index.tsx` | `window.api.humbleRecordGiftLinkOpened` | confirm-dialog confirm handler | WIRED | Confirmed |
| `Spares/index.tsx` | `window.api.openExternalUrl` | confirm-dialog confirm handler (static URL) | WIRED | Confirmed literal `https://www.humblebundle.com/home/keys`, no `${` interpolation |
| `user.ts` disconnect() | `humbleGiftedAtStore` | carve-out comment (NOT a .clear() call) | WIRED | Confirmed, and proven by passing survival test |
| `ipc_handler.ts` | `HumbleLibrary.recordGiftLinkOpened` | addHandler after server-side re-check | WIRED | Confirmed |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `Waiting/index.tsx` | `keys` (selectKeysWaiting output) | `humble.keys` from ContextProvider (live synced Humble data, Phase 11/12) | Yes | FLOWING |
| `Spares/index.tsx` | `keys` (selectGiftableSpares output) | same `humble.keys` context slice | Yes | FLOWING |
| `Spares/index.tsx` | `giftedMap` | `window.api.humbleGetGiftedAt()` -> real IPC call -> `HumbleLibrary.getAllGiftedAt()` -> `humbleGiftedAtStore.entries()` (real electron-store) | Yes | FLOWING |
| `All/index.tsx` | `groups` | `groupAndSortKeys(humble.keys)` — unchanged from pre-Phase-13 | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| getUrgencyTier boundary correctness (7d/30d) | Inline unit tests (`urgencyBadge.test.ts`) | 21 tests pass | PASS |
| getUrgencyCountdownParts 24h-48h window | Manual node reproduction against source logic: 25h/30h/36h/47h all -> `{kind:'days',value:2}` | Confirms CR-01 defect | FAIL |
| Full backend+frontend suite | `pnpm test` | 616/616 tests, 36/36 suites passed | PASS |
| Type/lint gate | `pnpm codecheck` | exit 0 | PASS |
| translation.json parses and contains all locked copy | `node -e "require('./public/locales/en/translation.json')"` | parses; all keys present (waitingBlurb, sparesBlurb, giftConfirmBody "gone for good", urgencyOneDayLeft, urgencyDaysLeft, urgencyHoursLeft, tab labels, empty states) | PASS |
| CSS uses semantic tokens only in the new blocks | Manual read of `index.css` lines 257-349 | No hex values; `.humbleUrgencyBadge--danger/--warning`, `.humbleKeysTabBar/.humbleKeysTab`, `.humbleKeyGiftButton/.humbleKeyGiftedAnnotation` all use `var(--...)` tokens | PASS |

### Probe Execution

Not applicable — no `scripts/*/tests/probe-*.sh` probes declared or discovered for this phase.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| HVIEW-01 | 13-01, 13-03, 13-05 | "Keys waiting" view lists unowned + unredeemed keys, sorted by expiration urgency then title | SATISFIED | selectKeysWaiting + compareWaiting + Waiting/index.tsx, 22 passing tests |
| HVIEW-02 | 13-01, 13-02, 13-04, 13-05 | "Giftable spares" view lists owned-elsewhere + UNREVEALED keys and exposes/copies the Humble gift link | SATISFIED | selectGiftableSpares + Spares/index.tsx gift-confirm flow; "copies" reinterpreted to "deep-link open" per the pre-implementation D-57 research resolution (documented, not a silent deviation) |

REQUIREMENTS.md still shows both as `[ ]`/"Pending" in its tracking table — this is expected pre-verification state (Phase 12's HDEDUP-01/02 rows show the same table gets updated to `[x]`/"Complete" after verification passes); not itself a gap.

No orphaned requirements found — REQUIREMENTS.md maps only HVIEW-01/HVIEW-02 to Phase 13, and both appear in plan frontmatter `requirements:` fields.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/common/humble/urgencyBadge.ts` | 66-83 | Incorrect date-math special-case (CR-01) | Blocker (see gap) | Countdown badge shows "2 days left" instead of "1 day left" for the entire 24h-48h window |
| `src/backend/humble/__tests__/urgencyBadge.test.ts` | ~98 | Test name/assertion mismatch — test titled to describe the correct spec but asserts the buggy value | Warning | Masks CR-01; a reviewer skimming test names would believe the 1-day case is covered |
| `src/backend/humble/library.ts` / `ipc_handler.ts` / `Spares/index.tsx` | 361-376 / 64-83 / 86 | Double-gift guard + eligibility check keyed by `machineName` alone (WR-01, per 13-REVIEW.md) | Warning | Edge case: a game owned via two separate Humble orders produces two rows sharing one machineName; gifting one over-blocks the other, and `.find()`'s first-match order can misvalidate. Does not affect the common single-order case. Tracked in 13-REVIEW.md, not independently re-verified as a blocking truth here since the core D-59 annotation behavior is demonstrably correct for the mainline case. |
| `src/frontend/screens/Humble/Keys/Spares/index.tsx` | 55-64 | Optimistic UI update with no reconciliation if the backend IPC rejects the write (WR-02) | Warning | If `humbleRecordGiftLinkOpened` silently no-ops (stale key list, race), the row still shows "gifted" locally until next mount — same disposition as WR-01, tracked not re-blocked |
| `src/backend/humble/electronStores.ts` / `library.ts` | 46-65 / 370-376 | machineName-keyed stores vulnerable to electron-store dot-notation key corruption if a machineName ever contains a `.` (WR-03) | Warning | Latent, shared with two pre-existing stores; not observed to trigger in current fixtures |

No TBD/FIXME/XXX/HACK/PLACEHOLDER markers found in any file modified by this phase.

### Human Verification Required

None newly required by this report. One item remains open from the Plan 05 checkpoint (tracked, not re-raised here per task instructions):

**Urgency badge colors on real expiring keys** — already recorded in `13-HUMAN-UAT.md` (status: partial). The connected test account currently has no keys within 30 days of expiry; re-test danger (red, <=7d) and warning (orange, 8-30d) badge colors visually once one does. The underlying tier-selection logic (`getUrgencyTier`) is unit-tested and independently confirmed correct by this report — only the live visual rendering remains unconfirmed.

### Gaps Summary

One confirmed code-level defect blocks a clean pass: `getUrgencyCountdownParts` does not implement the UI-SPEC-locked "24h-48h -> 1 day left" special case, instead applying a uniform `Math.ceil(daysLeft)` that yields "2 days left" for essentially the entire 24-48h window. This was independently reproduced by direct execution against the actual source logic (25h/30h/36h/47h all -> value 2) and matches Critical finding CR-01 already surfaced in 13-REVIEW.md — including the detail that the unit test meant to cover this exact case ("exactly-1-day range yields value 1") was edited to assert the wrong value (2) rather than catching the regression, so the test suite passes green despite the defect. This directly falsifies ROADMAP Success Criterion #2 ("...urgency badge showing the time remaining") for its most urgent display case, which is central to the phase's stated goal of letting users see expiration urgency "at a glance."

All other must-haves — route structure, tab wiring, All-keys no-regression, D-42 safety valve, gift-action flow with confirmation and double-gift annotation, backend persistence and disconnect survival, server-side IPC validation — are verified present, substantive, and correctly wired, with 616/616 tests and a clean `pnpm codecheck` passing. The fix for the one gap is small and precisely scoped (13-REVIEW.md already supplies the corrected implementation and test), so this should be a fast, low-risk gap-closure plan rather than a phase re-plan.

Three additional warnings (WR-01/02/03 from 13-REVIEW.md) describe real edge-case risks in the gift double-guard's machineName-only identity model, but none falsify the phase's primary observable truths for the mainline (single-order-per-game) case, so they are reported as warnings rather than blocking gaps.

---

_Verified: 2026-07-07T09:30:00Z_
_Verifier: Claude (gsd-verifier)_
