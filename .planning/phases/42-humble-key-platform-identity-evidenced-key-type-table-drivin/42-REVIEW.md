---
phase: 42-humble-key-platform-identity-evidenced-key-type-table-drivin
reviewed: 2026-09-30T00:00:00Z
depth: deep
files_reviewed: 18
files_reviewed_list:
  - meta/__tests__/genI18nGateScope.test.ts
  - meta/i18nForkTouchedFiles.json
  - src/backend/humble/__tests__/keyTypePresentation.test.ts
  - src/backend/humble/__tests__/library.test.ts
  - src/backend/humble/electronStores.ts
  - src/backend/humble/library.ts
  - src/backend/sidecar/storeRegistration.ts
  - src/common/humble/keyTypePresentation.ts
  - src/common/types/humble.ts
  - src/frontend/__mocks__/svgReactStub.tsx
  - src/frontend/__tests__/svgReactResolution.test.tsx
  - src/frontend/jest.config.js
  - src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/__tests__/index.test.tsx
  - src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/index.tsx
  - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/__tests__/index.test.tsx
  - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx
  - src/frontend/screens/Humble/Keys/index.css
  - public/locales/{49 languages}/gamelib.json (reviewed as one family; en read in full, ja/pl/ru/ar sampled for plural-form structure, all 49 censused for key presence)
findings:
  critical: 0
  warning: 0
  info: 1
  total: 1
status: issues_found
---

# Phase 42: Code Review Report

**Reviewed:** 2026-09-30T00:00:00Z
**Depth:** deep
**Files Reviewed:** 18 (including the 49-locale family reviewed as one unit)
**Status:** issues_found (Info only — no Critical or Warning findings)

## Summary

This review covers Phase 42's evidenced `key_type` presentation table
(`common/humble/keyTypePresentation.ts`), its two frontend consumers
(`HumbleKeyRow`, `HumbleClaimWizard`), the backend ownership-auto-settle path
(`recomputeOwnership`/`undoRedeemed` in `library.ts` plus the
disconnect-exempt `humbleSettleDeclinedStore`), the sidecar store-registration
wiring, and the associated test suites and locale catalogues, at `deep` depth
(cross-file import graphs, call chains, and type-consistency at module
boundaries).

**Scope note verified.** The scope for this review was computed from
phase-42-scoped commits rather than a raw `diff_base..HEAD` diff, because
three files Phase 42 authored no longer exist — deleted by
`edec139bd feat(43-08): delete the three Humble Keys tabs and HumbleKeyGroup`
(`src/frontend/screens/Humble/Keys/All/index.tsx`,
`src/frontend/screens/Humble/Keys/All/__tests__/index.test.tsx`,
`src/frontend/screens/Humble/Keys/components/HumbleKeyGroup/index.tsx`).
Plan 42-06's claim-annotation-fetching + settle-undo threading lived in those
files. **Explicit first-class question: did that behaviour survive the
deletion, or was it silently lost?**

**Answer: it survived, and its test coverage is arguably stronger now than
before the deletion.** `Keys/index.tsx`'s `settleActionFor()` (lines 399-425)
correctly reproduces the original gating — explicitly requiring
`redeemedSource === 'ownership-exact'` (never a `!== 'user'` inversion, which
would wrongly attach a second Undo to every pre-Phase-42 explicitly-marked
record) and a defined `redeemedAt` — and threads the result into
`HumbleKeyRow`'s `settleAction` prop (`Keys/index.tsx:519`). `HumbleKeyRow`'s
own `__tests__/index.test.tsx` carries a dedicated
`describe('HumbleKeyRow settleAction (D-42-01 Exception 4, Phase 42 plan 06)')`
block pinning the component-level rendering contract directly (Undo renders
and fires exactly once; "Already in your Steam library" caption; zero buttons
without the prop; `claimAction` wins over `settleAction` when both are
supplied on the same row — which `resolveKeyScenario`'s `!hasClaimAction`
guard, `HumbleKeyRow/index.tsx:241`, makes structurally true in practice
since an `ownedElsewhere` key never carries a `claimAction`). The backend
half — `recomputeOwnership`'s five-guard settle path and `undoRedeemed`'s
decline-record write (`library.ts:493-627`, `:1550-1572`) — is independently
and thoroughly pinned by `library.test.ts`'s
`describe('D-42-01/D-42-02 ownership auto-settle')` block, including a
table-driven `NON_SETTLING_CASES` array covering all six negative guards, an
undo-durability round-trip, and a WR-01 `allTerminal`/`freezeEligible`
recompute-after-settle test. `meta/i18nForkTouchedFiles.json` and
`meta/genI18nGateScope.test.ts` were also checked for a stale reference to
the three deleted files — none exists; the latter's dated history comment
explicitly documents the correct four-file removal from both i18n artifacts
at the same commit.

**Security posture.** `getRedeemTarget`'s closed two-member
`REDEEM_URL_BUILDERS` table (`keyTypePresentation.ts:131-137`) cannot be
reached by a hostile/URL-shaped `key_type` string beyond an exact `steam`/
`gog` match; the help-fallback branch deliberately drops the revealed code
(T-42-01); `isKeylessKeyType`/`getGameLibLoginStore` are both closed
`Record<string, ...>` lookups, not suffix/regex matches, so an unrecognised
or hostile `key_type` can only ever fall through to the safe (non-privileged)
branch. All three properties are directly exercised by explicit
"SECURITY PIN"-labelled tests in
`src/backend/humble/__tests__/keyTypePresentation.test.ts`.

**CSS.** `src/frontend/screens/Humble/Keys/index.css` was read in full. It is
unusually well-instrumented — in-line rationale for every WKWebView/
`color-mix` fallback trap, an explicit note on why `--success` (not the raw
`--status-success` token) is used for `.humbleKeyOwnedBadge` text specifically
to avoid a previously-measured 1.46:1 contrast failure against
`body.nord-light`, and a scoped `.gogIcon` fill override with a documented
specificity argument. No selector duplication, no raw/theme-adaptive token
misuse, no `--status-*` used where `--success`/`--danger` was required. No
defects found.

**i18n / locale family.** Reviewed as one mechanical key-addition family per
instruction, not as 49 independent surfaces. `en/gamelib.json`'s `humbleKeys`
namespace (all Phase 42/43 keys) is alphabetically sorted, and a full
33-key census against the wizard/row consumer call sites (including all
Phase 42-introduced keys: `openSteam`, `openStore`, `redeemOnPlatform`,
`platformOther`, `settledFromOwnership`, `redeemedAnnotation`, etc.) shows
100% presence. All 49 locale files carry `settledFromOwnership`. Plural-form
structure was sampled on `ja`/`pl`/`ru`/`ar` for both `cooldown`/
`revealCooldownBody` (two duplicate but independently-maintained pairs) and
confirmed CLDR-correct: `ja` 2 identical categories, `pl`/`ru` 4 categories
(`one`/`few`/`many`/`other`), `ar` 6 categories
(`zero`/`one`/`two`/`few`/`many`/`other`). No gaps found. `public/locales/`
is confirmed prettier-ignored (`npx prettier --file-info` →
`{"ignored":true,"inferredParser":null}`), consistent with the project
convention — no formatting claim is made against it.

**Formatting.** `npx prettier --check` against every non-ignored file in
scope (`index.css`, `HumbleKeyRow/index.tsx` and its test, `HumbleClaimWizard/
index.tsx`, `keyTypePresentation.ts`, `library.ts`, `electronStores.ts`,
`storeRegistration.ts`, `common/types/humble.ts`, `jest.config.js`) passes
cleanly.

Only one Info-level finding was surfaced across this review: a stale JSDoc
comment referencing a UI structure (the "All" tab's Redeemed group) that no
longer exists. It has zero behavioral impact — the code and its test coverage
are both correct — but is misleading for a future maintainer trying to
understand where the `settleAction` prop is actually wired from.

## Info

### IN-01: Stale JSDoc references a deleted UI structure ("All-keys' Redeemed group")

**File:** `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx:110-120`
**Issue:** The `settleAction` prop's JSDoc opens with "D-42-01 (Phase 42):
All-keys' Redeemed group ONLY — omitted (undefined) everywhere else." That
"All" tab and its "Redeemed" sub-group (rendered via the now-deleted
`HumbleKeyGroup` component) were removed by Phase 43-08
(`edec139bd feat(43-08): delete the three Humble Keys tabs and
HumbleKeyGroup`). The prop's actual current caller is `Keys/index.tsx`'s
unified flat list via `settleActionFor()` (`Keys/index.tsx:406-425`, threaded
at `Keys/index.tsx:519`), which is not scoped to any group or tab — it is
computed for every row in the single list. The rest of the comment (the
rationale for why the prop exists at all, and the `ClaimAnnotation.
redeemedSource === 'ownership-exact'` gating description) remains accurate;
only the opening scope clause is stale.
**Fix:** Update the opening clause to describe the current caller instead of
the deleted one, e.g.:
```ts
/** D-42-01 (Phase 42), threaded by Keys/index.tsx's settleActionFor() for
 * any row in the unified list — omitted (undefined) everywhere else.
 * Renders the reversal affordance for a key the app settled from an
 * exact-match Steam ownership signal
 * (`ClaimAnnotation.redeemedSource === 'ownership-exact'`). ...
 */
```

---

_Reviewed: 2026-09-30T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
