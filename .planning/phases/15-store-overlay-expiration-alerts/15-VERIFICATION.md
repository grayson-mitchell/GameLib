---
phase: 15-store-overlay-expiration-alerts
verified: 2026-07-10T09:00:00Z
status: gaps_found
score: 8/10 must-haves verified
overrides_applied: 0
gaps:
  - truth: "A Discounts title that exactly matches an unclaimed waiting Humble key (and is not owned) shows a 'Key available' pill (D-84)"
    status: failed
    reason: "CR-01 confirmed by direct code trace. src/frontend/screens/Discounts/index.tsx builds BOTH `titleToSteamAppId` (line 81-88) and `ownedSteamAppIds` (line 90-93) from the SAME source, `steam.library`. Inside resolveDiscountBadge (src/common/discounts/badges.ts:41-55), the only way to obtain a non-undefined `appId` is a hit in `titleToAppId` — and since every value in that map is a `game.app_name` drawn from `steam.library`, that same appId is always present in `ownedAppIds`. `ownedAppIds.has(appId)` is therefore always true whenever appId resolves, so the function returns 'owned' before it ever reaches the `hasWaitingKey` branch (badges.ts:48-55). A Humble key for a game NOT in steam.library never gets an appId in the first place (titleToSteamAppId has no entry for it), so the helper returns null. The 'key-available' branch is unreachable from this call site in production. badges.test.ts stays green only because it manually passes an empty `ownedAppIds` alongside a populated `titleToAppId` — a state the real container structurally cannot produce."
    artifacts:
      - path: "src/frontend/screens/Discounts/index.tsx"
        issue: "titleToSteamAppId and ownedSteamAppIds both derive from steam.library only; humble.keys' own steamAppId is never merged into the title->appId bridge, so an unowned-but-keyed game can never resolve to a non-owned appId"
      - path: "src/common/discounts/badges.ts"
        issue: "resolveDiscountBadge's key-available branch (lines 48-55) is logically correct in isolation but dead code given the container's actual inputs"
    missing:
      - "Merge humble.keys' waiting-key steamAppId entries into titleToSteamAppId (or an equivalent second map) so a title with no steam.library entry can still resolve to an appId that is NOT in ownedSteamAppIds"
      - "Add an integration-level test that builds titleToAppId/ownedAppIds exactly as the real container does (not hand-decoupled) to catch this regression class"
deferred: []
human_verification: []
---

# Phase 15: Store Overlay + Expiration Alerts Verification Report

**Phase Goal:** Store surfaces show Humble ownership badges; newly-expiring keys trigger OS notifications.
**Verified:** 2026-07-10T09:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | An exact Steam-library title match shows an 'Owned' pill (15-01) | VERIFIED | `Discounts/index.tsx:487-502` computes `discountBadges` via `resolveDiscountBadge`; `DiscountCard/index.tsx:76-80` renders `discountCard__badge--owned` when `badge === 'owned'` |
| 2 | An unclaimed waiting Humble key (not owned) shows a 'Key available' pill (15-01, D-84) | FAILED | See gap above — `resolveDiscountBadge`'s `'key-available'` branch is structurally unreachable because `titleToSteamAppId` and `ownedSteamAppIds` are both derived from `steam.library` only |
| 3 | No exact title match shows no pill (15-01, D-79/D-82) | VERIFIED | `badges.ts:41-44` returns `null` when `titleToAppId.get(normalize(...))` is `undefined`; unaffected by the CR-01 defect |
| 4 | Owned + spare key shows only 'Owned', never both (15-01, D-85) | VERIFIED (moot) | `badges.ts:45-47` returns `'owned'` before the key-available check runs — precedence holds, though this is now the ONLY reachable outcome for any title match |
| 5 | Notify toggle in Settings -> General, default ON (15-02, D-93) | VERIFIED | `NotifyHumbleExpirations.tsx` uses `useSetting('notifyHumbleExpirations', true)`; registered in `GeneralSettings/index.tsx:26,72`; `config.ts:329` sets factory default `true`; `types.ts:98` declares the field |
| 6 | Disconnect-exempt store records last-notified expiration per key (15-02, D-92) | VERIFIED (with WR-01 caveat) | `electronStores.ts:149-152` defines `humbleNotifiedExpirationStore`, keyed by `machineName`, not cleared on disconnect (per D-04 exemption pattern). See WARNING below re: collision risk. |
| 7 | null->date transition fires one digest notification; same date never re-fires; changed date re-fires (15-03, D-90/D-92) | VERIFIED | `expirationAlerts.ts:19-70`; `expirationAlerts.test.ts` (12 tests, all passing) covers transition/no-op/re-fire cases |
| 8 | First-ever sync seeds baseline without firing (15-03, locked decision 3) | VERIFIED | `expirationAlerts.ts:44-46` returns before any notification when `opts.suppressNotifications` is true, after the store has already been advanced in the loop above |
| 9 | Click focuses window + navigates to /humble-keys/waiting (15-03, D-91) | VERIFIED | `expirationAlerts.ts:65-68` |
| 10 | Pinned 'Expiring soon' section moves (not duplicates) urgency-tier keys to the top; hidden entirely when empty; static non-interactive heading (15-04, D-86/87/88/89) | VERIFIED | `viewFilters.ts:91-105` `partitionWaitingByUrgency` single-pass split; `Waiting/index.tsx:198-213` renders section only when `pinned.length > 0`, heading has no click handler/aria-expanded (`humbleKeyGroupHeading--static`) |

**Score:** 8/10 truths verified (9/10 if counting #4 as verified-but-moot; #2 is a genuine BLOCKER)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/common/discounts/badges.ts` | Pure `resolveDiscountBadge` helper | EXISTS, substantive, unit-tested | Logic is correct in isolation; the defect is in how the caller constructs its inputs |
| `src/frontend/screens/Discounts/index.tsx` | title->AppID bridge + per-product badge memoization | EXISTS, WIRED, but data-flow HOLLOW for the 'key-available' case | `titleToSteamAppId`/`ownedSteamAppIds` both sourced from `steam.library`, making one of the two badge outcomes unreachable |
| `src/frontend/screens/Discounts/components/DiscountCard/index.tsx` | Non-interactive ownership pill from `badge` prop | VERIFIED | Renders both `owned` and `key-available` cases correctly when given a badge |
| `src/common/types.ts` / `src/backend/config.ts` | `notifyHumbleExpirations` setting + default | VERIFIED | Present in both |
| `src/frontend/screens/Settings/components/NotifyHumbleExpirations.tsx` | Toggle component | VERIFIED, WIRED into `GeneralSettings` |
| `src/backend/humble/electronStores.ts` | `humbleNotifiedExpirationStore` | VERIFIED to exist; keying scheme carries a real collision risk (WR-01) |
| `src/backend/humble/expirationAlerts.ts` | `detectAndNotifyExpirationTransitions` + digest builder | VERIFIED, WIRED into `library.ts:1019` (`runSync()`) |
| `src/common/humble/viewFilters.ts` | `partitionWaitingByUrgency` | VERIFIED, unit-tested, WIRED into `Waiting/index.tsx` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `Discounts/index.tsx` | `common/discounts/badges.ts` | `resolveDiscountBadge()` call in memoized map | WIRED (but see data-flow gap) | Call exists and result is passed to `DiscountCard`; the inputs to the call are the defect |
| `DiscountCard/index.tsx` | `props.badge` | Conditional pill render | WIRED | Confirmed |
| `GeneralSettings/index.tsx` | `NotifyHumbleExpirations` | Component registration + barrel export | WIRED | Confirmed |
| `library.ts` (`runSync()`) | `expirationAlerts.ts` | `detectAndNotifyExpirationTransitions(getKeys(), ...)` at `library.ts:1019` | WIRED | Confirmed |
| `expirationAlerts.ts` | `/humble-keys/waiting` | `sendFrontendMessage('openScreen', ...)` in click handler | WIRED | Confirmed |
| `expirationAlerts.ts` | `humbleNotifiedExpirationStore` | get/set keyed by `key.machineName` | WIRED but keying is a collision risk | See WR-01 |
| `Waiting/index.tsx` | `common/humble/viewFilters.ts` | `partitionWaitingByUrgency(selectKeysWaiting(...))` | WIRED | Confirmed |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `Discounts/index.tsx` `discountBadges` map | `resolveDiscountBadge(product, titleToSteamAppId, ownedSteamAppIds, keysWaiting)` | `titleToSteamAppId`/`ownedSteamAppIds` both from `steam.library`; `keysWaiting` from `selectKeysWaiting(humble.keys)` | Real data flows, but the `'key-available'` outcome is mathematically unreachable given how the two maps are constructed | HOLLOW — wired but the specific `'key-available'` code path is dead |
| `Waiting/index.tsx` `pinned`/`rest` | `partitionWaitingByUrgency(selectKeysWaiting(humble.keys))` | `humble.keys` from ContextProvider (live Humble sync data) | Yes | FLOWING |
| `expirationAlerts.ts` `newlyExpiring` | `getKeys()` in `library.ts` | Real cached Humble key data from `humbleLibraryStore` | Yes | FLOWING (subject to WR-01 machineName-collision risk noted below) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| HSTORE-01 | 15-01 | Store titles badged Owned / Unclaimed-key-available / New | PARTIALLY SATISFIED | 'Owned' and 'no badge' states work; 'Unclaimed-key-available' state is unreachable in production (CR-01) — the requirement's second of three stated states is not delivered |
| HSTORE-03 | 15-02, 15-03, 15-04 | Expiring-soon surface + optional OS notifications for newly-expiring keys | SATISFIED (with a WARNING) | Pinned section, digest notification, settings gate, and dedup mechanism are all present and unit-tested; the dedup keying (machineName-only) carries a real re-fire risk under a specific data condition (WR-01) that the "newly-expiring" single-fire intent is meant to prevent |

No orphaned requirements — both HSTORE-01 and HSTORE-03 are declared in PLAN frontmatter (`15-01-PLAN.md`, `15-02/03/04-PLAN.md`) and match the two IDs mapped to Phase 15 in REQUIREMENTS.md (lines 159-160).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/frontend/screens/Discounts/index.tsx` | 81-93 | Two supposedly-independent inputs to a pure function derived from the identical source, defeating the function's own branching logic | BLOCKER | Directly causes HSTORE-01 gap #2 above (CR-01) |
| `src/backend/humble/expirationAlerts.ts` | 27-38 | Dedup store keyed by `key.machineName` alone, while sibling stores added one phase earlier (`humbleAuditStore`, `humbleLocalRedeemedStore`) deliberately switched to a composite `gamekey:machineName` key specifically to prevent this class of collision (Phase 14 WR-01 lesson) | WARNING | Re-fire risk under duplicate-machineName-across-orders condition; see WR-01 below |
| `src/backend/humble/expirationAlerts.ts` | 88-109 | `i18next.t('humble.notification.expiringTitleSingle', ...)` and 3 sibling keys are referenced but never registered in `public/locales/en/translation.json` (confirmed via grep — zero matches for `humble.notification` or `expiringTitle`/`expiringBody` anywhere in the file, unlike `discounts.badge.owned`/`discounts.badge.keyAvailable` which ARE registered) | WARNING | English-only in practice; no translator-facing key exists for any other locale |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Trace `resolveDiscountBadge` reachability for `'key-available'` given the container's actual map construction | Manual code trace (not a runtime check — traced the exact logic by hand against `Discounts/index.tsx:81-93` and `badges.ts:35-56`) | Confirmed: `ownedAppIds.has(appId)` is always true whenever `appId` is defined, because both maps derive from `steam.library` | FAIL (confirms CR-01) |
| Unit test suite for all 4 plans | `npx jest expirationAlerts.test.ts badges.test.ts viewFilters.test.ts electronStores.test.ts` | 4 suites, 69 tests, all PASS | PASS (but does not catch CR-01 — see below) |

`badges.test.ts` passes 100% because its test fixtures hand-construct `titleToAppId` and `ownedAppIds` as independent maps — a state the real container structurally cannot produce. This is precisely the kind of stub-detection case goal-backward verification exists to catch: task complete (tests green, artifacts exist, code is "wired") but the goal (a user actually seeing a 'Key available' pill) is not achieved.

### Human Verification Required

None. Both the HSTORE-01 gap and the HSTORE-03 warnings are resolvable by direct code inspection — no visual, real-time, or external-service behavior is in question.

### Gaps Summary

**BLOCKER (must fix before Phase 15 can be considered done):**

CR-01 is confirmed by direct trace of `src/frontend/screens/Discounts/index.tsx` against `src/common/discounts/badges.ts`. The container builds `titleToSteamAppId` and `ownedSteamAppIds` from the identical source (`steam.library`), which mathematically guarantees `ownedAppIds.has(appId)` is true whenever `appId` resolves at all — so `resolveDiscountBadge` can never return `'key-available'` in production. HSTORE-01 explicitly requires three distinguishable states (Owned / Unclaimed-key-available / New); only two are actually reachable. This is not a cosmetic gap — a Humble key holder for a game they don't yet own on Steam gets zero signal on the Discounts screen that a free key exists, which is the entire point of the "Key available" badge per the phase's own D-84 decision and UI-SPEC.

**WARNINGS (recommend a human decision before proceeding, do not block phase closure on their own):**

- WR-01: `humbleNotifiedExpirationStore` keys by `machineName` alone. The phase's own RESEARCH.md justified this by citing `humbleRevealedStore`/`humbleOwnershipOverrideStore`/`humbleGiftedAtStore` as precedent — but those are OLDER (pre-Phase-14) stores. Phase 14 introduced a composite `gamekey:machineName` key specifically for `humbleAuditStore` and `humbleLocalRedeemedStore` to prevent cross-gamekey machineName collisions (the WR-01 lesson from that phase). Phase 15's dedup store did not adopt that later, more considered convention. `getKeys()` (`library.ts:458-464`) flattens keys across all orders with no de-dup, so if the same `machineName` genuinely appears in two orders with different expirations, the notification can re-fire indefinitely — undermining HSTORE-03's "does not repeat" intent. This needs an explicit human call: was citing the older-store precedent in RESEARCH.md a considered decision, or an oversight that missed the Phase 14 fix?
- WR-02: The four `i18next.t('humble.notification.*', ...)` keys used by `buildDigestCopy` are never registered in `public/locales/en/translation.json`, unlike the `discounts.badge.*` keys from the same phase, which ARE registered. The feature works in English only via inline fallback strings; every other locale silently falls back to English with no translator-visible key.

## Override Consideration

If the WR-01 machineName-alone keying is judged intentional (i.e., the product decision is that this edge case — duplicate machineName across two orders with genuinely different expirations — is rare enough or otherwise mitigated, and RESEARCH.md's citation of the older-store precedent was a deliberate choice rather than an oversight), it can be accepted via an override entry rather than requiring a code change:

```yaml
overrides:
  - must_have: "A disconnect-exempt per-key store records the last-notified expiration date, keyed by machineName, surviving app restarts and Humble disconnect/reconnect (D-92)"
    reason: "Deliberate choice to follow the humbleRevealedStore/humbleOwnershipOverrideStore/humbleGiftedAtStore machineName-only convention per Phase 15 RESEARCH.md; duplicate-machineName-across-orders-with-different-expirations judged acceptably rare"
    accepted_by: "{name}"
    accepted_at: "{ISO timestamp}"
```

No override is offered for CR-01 — it is a straightforward defeat of one of HSTORE-01's three required badge states, not a debatable tradeoff.

---

_Verified: 2026-07-10T09:00:00Z_
_Verifier: Claude (gsd-verifier)_
