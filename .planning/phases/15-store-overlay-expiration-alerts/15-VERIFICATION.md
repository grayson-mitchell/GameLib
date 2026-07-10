---
phase: 15-store-overlay-expiration-alerts
verified: 2026-07-10T02:26:41Z
status: passed
score: 10/10 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 8/10
  gaps_closed:
    - "A Discounts title that exactly matches an unclaimed waiting Humble key (and is not owned) shows a 'Key available' pill (D-84) — CR-01"
  warnings_closed:
    - "WR-01: expiration dedup store re-keyed to composite gamekey:machineName with legacy backfill"
    - "WR-01 (divergence): keysWaiting derived once, fed to BOTH buildDiscountBadgeMaps and resolveDiscountBadge (commit baac4527)"
    - "WR-02: four humble.notification.* i18n keys registered in translation.json"
  gaps_remaining: []
  regressions: []
gaps: []
deferred: []
human_verification: []
---

# Phase 15: Store Overlay + Expiration Alerts Verification Report

**Phase Goal:** Store browsing surfaces show Humble ownership context as additive badges and users are alerted when keys gain new expiration deadlines detected on sync.
**Verified:** 2026-07-10T02:26:41Z
**Status:** passed
**Re-verification:** Yes — after gap closure (15-05 CR-01, 15-06 WR-01/WR-02, follow-up baac4527)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | An exact Steam-library title match shows an 'Owned' pill (15-01) | VERIFIED | `badges.ts:45-47` returns `'owned'` when `ownedAppIds.has(appId)`; container passes maps to `resolveDiscountBadge` (`Discounts/index.tsx:503`); `DiscountCard` renders the literal. Unchanged from prior PASS. |
| 2 | An unclaimed waiting Humble key (not owned) shows a 'Key available' pill (15-01, D-84) | VERIFIED (gap closed) | `buildDiscountBadgeMaps` (`badges.ts:77-105`) merges each waiting key's `steamAppId` into `titleToAppId` for titles absent from steam.library while keeping `ownedAppIds` steam.library-only, so an unowned-but-keyed AppID resolves to `'key-available'` (badges.ts:48-55). Container wires it at `Discounts/index.tsx:100-104`. Integration regression test `badges.test.ts:129` (CR-01) passes and demonstrably exercises the real map path. |
| 3 | No exact title match shows no pill (15-01, D-79/D-82) | VERIFIED | `badges.ts:41-44` returns `null` when the normalized title is absent from `titleToAppId`. Test `badges.test.ts:156`. |
| 4 | Owned + spare key shows only 'Owned', never both (15-01, D-85) | VERIFIED | `badges.ts:45-47` returns `'owned'` before the key-available branch; steam.library wins the title slot on collision (`badges.ts:84,97`). Now genuinely reachable (both branches live). Test `badges.test.ts:142`. |
| 5 | Notify toggle in Settings → General, default ON (15-02, D-93) | VERIFIED | `notifyHumbleExpirations` default `true` (config), setting gate at `expirationAlerts.ts:71`. Unchanged from prior PASS. |
| 6 | Disconnect-exempt store records last-notified expiration per key (15-02, D-92) | VERIFIED (gap closed) | `humbleNotifiedExpirationStore` (`electronStores.ts:157-160`) now documented and keyed by composite `gamekey:machineName` (comment lines 140-156); D-04 disconnect exemption preserved. |
| 7 | null→date fires once; same date no-op; changed date re-fires (15-03, D-90/D-92) | VERIFIED | `expirationAlerts.ts:45-55` keyed by composite; tests `expirationAlerts.test.ts:171,183,194` pass. Composite re-keying preserves transition semantics. |
| 8 | First-ever sync seeds baseline without firing (15-03, locked decision 3) | VERIFIED | `expirationAlerts.ts:58-64` advances store then returns under `suppressNotifications`; test line 209. |
| 9 | Click focuses window + navigates to /humble-keys/waiting (15-03, D-91) | VERIFIED | `expirationAlerts.ts:83-86`; test line 360. |
| 10 | Pinned 'Expiring soon' section moves urgency-tier keys, hidden when empty, static heading (15-04) | VERIFIED | `partitionWaitingByUrgency` + `Waiting/index.tsx` render gate. Unchanged from prior PASS. |

**Score:** 10/10 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/common/discounts/badges.ts` | `resolveDiscountBadge` + `buildDiscountBadgeMaps` | VERIFIED | Both exported; helper merges waiting-key AppIDs into `titleToAppId`, `ownedAppIds` steam.library-only. Substantive, unit + integration tested. |
| `src/frontend/screens/Discounts/index.tsx` | Single shared `keysWaiting` feeding both map builder and resolver | VERIFIED | `keysWaiting` memo (89-92) → `buildDiscountBadgeMaps(steam.library, keysWaiting)` (100-104) and `resolveDiscountBadge(..., keysWaiting)` (503-508). Divergence eliminated (baac4527). |
| `src/backend/humble/expirationAlerts.ts` | Composite-keyed dedup + legacy backfill | VERIFIED | Composite `${key.gamekey}:${key.machineName}` (line 26); backfill lines 35-43; transition/suppression logic intact. |
| `src/backend/humble/electronStores.ts` | Store comment reflects composite keying | VERIFIED | Comment lines 140-156 cite composite convention + WR-01 lesson + backfill + D-04 exemption. |
| `public/locales/en/translation.json` | Four `humble.notification.*` keys | VERIFIED | Lines 548-554: `humble.notification.{expiringBodyPlural,expiringBodySingle,expiringTitlePlural,expiringTitleSingle}`, alphabetical, before `humbleKeys`, valid JSON (jest suite parses). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `Discounts/index.tsx` | `badges.ts` | `buildDiscountBadgeMaps` + `resolveDiscountBadge` (shared `keysWaiting`) | WIRED | Both consumers fed the identical filtered list — key-available now reachable and un-suppressible. |
| `expirationAlerts.ts` | `electronStores.ts` | `humbleNotifiedExpirationStore` get/set by composite `gamekey:machineName` | WIRED | Composite used on lines 36-52; legacy `machineName` read only for backfill. |
| `expirationAlerts.ts` | `translation.json` | `i18next.t('humble.notification.*', fallback)` | WIRED | All four referenced keys registered; inline English fallbacks unchanged. |
| `library.ts` runSync | `expirationAlerts.ts` | `detectAndNotifyExpirationTransitions(...)` | WIRED | Unchanged from prior PASS. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `Discounts/index.tsx` `discountBadges` | `resolveDiscountBadge(product, titleToSteamAppId, ownedSteamAppIds, keysWaiting)` | `buildDiscountBadgeMaps(steam.library, keysWaiting)` — waiting keys now merged into `titleToAppId`, owned set steam.library-only | Yes — `'key-available'` outcome is now mathematically reachable | FLOWING (prior HOLLOW state resolved) |
| `expirationAlerts.ts` `newlyExpiring` | composite-keyed store transitions | `getKeys()` cached Humble data | Yes — composite key removes cross-order collision | FLOWING |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| HSTORE-01 | 15-01, 15-05 | Store titles badged Owned / Unclaimed-key-available / New | SATISFIED | All three badge states now reachable; CR-01 and WR-01 divergence closed; regression tests green |
| HSTORE-03 | 15-02, 15-03, 15-04, 15-06 | Expiring-soon surface + optional OS notifications for newly-expiring keys | SATISFIED | Pinned section, digest notification, settings gate; composite-keyed collision-safe dedup + legacy backfill; i18n keys registered |

Both Phase-15 requirement IDs (REQUIREMENTS.md lines 89-90, 159-160) are declared in PLAN frontmatter and accounted for. No orphaned requirements.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Badge + expiration unit/integration suites | `npx jest badges.test.ts expirationAlerts.test.ts` | 2 suites, 31 tests, all PASS | PASS |
| CR-01 regression: key-available reachable via real map path | `badges.test.ts:129` | Passes; exercises `buildDiscountBadgeMaps` | PASS |
| WR-01 divergence: non-waiting decoy does not suppress key-available | `badges.test.ts:182` (single `selectKeysWaiting` fed to both) | Passes | PASS |
| WR-01 composite dedup: duplicate machineName across orders fires once, no re-fire | `expirationAlerts.test.ts:236,280` | Passes | PASS |
| WR-01 legacy backfill: pre-migration machineName entry treated as already-notified | `expirationAlerts.test.ts:318` | Passes | PASS |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No TBD/FIXME/XXX/HACK/PLACEHOLDER debt markers in any modified file | ℹ️ Info | Clean |
| `expirationAlerts.ts` | 35-43 | Legacy backfill emits at most one terminal re-fire on upgrade for the exact collided-machineName case (IN-01) | ℹ️ Info | Bounded, self-healing, strictly better than the prior every-sync re-fire; accepted in 15-REVIEW.md (status: resolved) |

### Human Verification Required

None. All prior gaps were code-inspectable and are now closed with passing unit + integration regression tests. Badge rendering (`DiscountCard`) and settings toggle wiring were verified in the initial pass and are unchanged.

### Gaps Summary

All prior gaps closed; no regressions.

- **CR-01 (HSTORE-01 BLOCKER)** — CLOSED. `buildDiscountBadgeMaps` makes the `'key-available'` branch reachable from real container inputs; owned precedence (D-83/D-85) and no-match→null (D-79/D-82) preserved. The follow-up WR-01 divergence (map built from all keys, resolver matched against waiting subset) was fixed in commit `baac4527` — `keysWaiting` is derived once and fed to both consumers, with a decoy-key regression test.
- **WR-01 (HSTORE-03)** — CLOSED. Dedup store re-keyed to composite `gamekey:machineName` (Phase 14 convention) with a one-time legacy backfill; transition semantics (null→date fires, same-date no-op, changed-date re-fires, first-sync seeds silently) preserved and test-covered.
- **WR-02 (HSTORE-03)** — CLOSED. All four `humble.notification.*` keys registered in `translation.json`, matching the inline English fallbacks.

---

_Verified: 2026-07-10T02:26:41Z_
_Verifier: Claude (gsd-verifier)_
