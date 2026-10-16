---
phase: 43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit
reviewed: 2026-09-29T00:00:00Z
depth: standard
files_reviewed: 21
files_reviewed_list:
  - meta/__tests__/genI18nGateScope.test.ts
  - meta/hardcodedStringGate.ts
  - meta/i18nForkTouchedFiles.json
  - meta/i18nGateScope.json
  - meta/lintScoped.cjs
  - public/locales/en/gamelib.json
  - src/backend/humble/__tests__/keyTypePresentation.test.ts
  - src/backend/humble/__tests__/viewFilters.test.ts
  - src/backend/humble/classify.ts
  - src/backend/humble/library.ts
  - src/common/humble/genericKeyPlatform.ts
  - src/common/humble/keyTypePresentation.ts
  - src/common/humble/viewFilters.ts
  - src/frontend/App.tsx
  - src/frontend/screens/Humble/Keys/__tests__/index.test.tsx
  - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/__tests__/index.test.tsx
  - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx
  - src/frontend/screens/Humble/Keys/index.css
  - src/frontend/screens/Humble/Keys/index.tsx
  - src/frontend/screens/Humble/Keys/stateLabels.ts
  - src/frontend/screens/Login/__tests__/loginInFlightUiReachability.test.tsx
findings:
  critical: 0
  warning: 2
  info: 1
  total: 3
status: issues_found
---

# Phase 43: Code Review Report

**Reviewed:** 2026-09-29T00:00:00Z
**Depth:** standard
**Files Reviewed:** 21
**Status:** issues_found

## Summary

Reviewed the unified Humble Keys list (Phase 43) at standard depth: the screen component, the
per-row `HumbleKeyRow`, the shared pure lookup/filter modules (`keyTypePresentation.ts`,
`viewFilters.ts`, `genericKeyPlatform.ts`), the retained classification module (`classify.ts`),
`library.ts`'s claim-annotation surface, the app route table, the four test suites in scope, the
locale catalog, and the i18n-gate tooling/config files.

This codebase is unusually defensively built around its own known-history defects. I specifically
re-verified, by reading source rather than trusting comments:

- **REQ-43-24** (the `gog_keyless` "Claim on Humble" button that used to open the embedded store
  webview directly with no host): confirmed fixed. `HumbleKeyRow` is hook-free and contains no
  `window.api.storeEmbedOpen()` call anywhere in scope; the keyless claim destination is built in
  `Keys/index.tsx`'s `onClaim` callback (`index.tsx:477-478`) as a `navigate(humbleKeysEmbedPath())`
  call, i.e. a route change through the same Phase 40 host route every other embed use goes
  through, not a second opener. The fix now also covers `epic_keyless`/`origin_keyless`, not just
  `gog_keyless` (260925-kt4), and a hostile/unrecognized `foo_keyless` platform is proven (test +
  source) to fall through to the ordinary keyed-claim path rather than being treated as keyless.
- **Keyless entitlements never offer a redeem affordance that implies a code exists**:
  `isGiftable` (`viewFilters.ts:161-165`) and `REDEEM_URL_BUILDERS` (`keyTypePresentation.ts`)
  both explicitly exclude every `isKeylessKeyType` platform via the same closed-set table, and the
  claim button's label is pinned by test to never namecheck the underlying store for a keyless key
  (`HumbleKeyRow/__tests__/index.test.tsx:1440-1519`).
- **D-43-17 ("interactivity lives in the KEY column only")**: TYPE/GAME cells are proven by test to
  carry zero click handlers/buttons/links, including on a "fully affordanced" row, so this isn't a
  vacuous check.
- **`openGiftDialog`/`onPickOnHumble`** (`Keys/index.tsx:369-396`, `:527-530`) open the system
  browser via `window.api.openExternalUrl` rather than the Phase 40 embed. This is a different,
  pre-existing, explicitly-documented design choice (D-57/D-58, carried forward from the old Spares
  tab) distinct from REQ-43-24's claim-button bug — not a regression of the same defect.
- **`{{count}}`/i18next plural usage** (`gamelib.json`'s `humbleKeys.cooldown_one/_other`,
  `syncing_one/_other`) is the correct v4 `_one`/`_other` pluralization idiom, not a violation of
  the "`{{count}}` is reserved" trap.
- **`--status-*` vs `--success`/`--danger` token usage**: `index.css` uses the raw `--status-*`
  tokens only for solid-fill badges and the theme-adaptive `--success` token for the one on-background
  text site, with an in-repo contrast measurement backing the choice — correct per the known repo
  trap.

No Critical-severity issues were found. Two Warnings and one Info item were found, detailed below —
all documentation/dead-code quality issues, not functional defects.

## Warnings

### WR-01: Dead CSS from the deleted grouped/tabbed presentation

**File:** `src/frontend/screens/Humble/Keys/index.css:91, 116, 126, 142, 146, 152, 156, 170, 176, 180`
**Issue:** Ten selectors styling the retired grouped/collapsible/pinned-section presentation
(`.humbleKeysGroupList`, `.humbleKeyGroup`, `.humbleKeyGroupHeading`, `.humbleKeyGroupLabel`,
`.humbleKeyGroupChevron`, `.humbleKeyGroupChevron--open`, `.humbleKeyGroupCount`,
`.humbleKeyGroupHeading--static`, `.humbleKeysPinnedSection`, `.humbleKeyGroupList`) remain in the
stylesheet with zero remaining consumers. `git log` shows two Phase 43 commits touched this file
(`50d8eba9a` converting it to the Column Geometry Contract, `f24a1d927`/`f1ceb2fa5` deleting the
`HumbleKeyGroup` component and the three tab screens) but neither commit removed these rules.
Confirmed via grep: no `.tsx`/`.ts` file under `Humble/Keys/` references any of these class names —
the only remaining references are in `index.test.tsx` (lines 1171, 1185), which assert their
*absence* from the rendered tree, i.e. even the test suite treats these as retired. This is dead
weight, not a functional bug, but it will actively mislead a future editor into thinking the
grouped/pinned presentation is still a live, styled surface.
**Fix:** Delete the ten orphaned rules (`index.css:91-95`, `116-163`, `170-172`, `176-178`,
`180-186`), keeping the two comment blocks only if their content is repurposed, e.g.:
```css
/* delete: .humbleKeysGroupList, .humbleKeyGroup, .humbleKeyGroupHeading,
   .humbleKeyGroupLabel, .humbleKeyGroupChevron(--open), .humbleKeyGroupCount,
   .humbleKeyGroupHeading--static, .humbleKeysPinnedSection, .humbleKeyGroupList */
```

### WR-02: Stale line-number citation to the claim gate, in a self-declared load-bearing test mirror

**File:** `src/backend/humble/__tests__/viewFilters.test.ts:390-391`, `src/common/humble/viewFilters.ts:130`
**Issue:** Both files cite the real per-row claim gate as living at
`screens/Humble/Keys/index.tsx:421-424`. That range no longer contains the claim gate — it is now
the `onUndoSettle` handler inside `settleActionFor` (an unrelated helper). The actual claim gate
(`!key.ownedElsewhere && key.platform !== GENERIC_KEY_PLATFORM && hasClaimEligibleState(key)`) is
at `index.tsx:456-459` today. The test file's own comment makes the citation load-bearing, not
decorative: `claimGateHolds` in `viewFilters.test.ts` is explicitly described as "a mirror, not the
article itself... If the real gate is ever changed, this mirror must change with it — the
co-occurrence assertion is only as honest as this copy." A maintainer following the citation to
verify or update the mirror after a future edit to the real gate will land on unrelated code and
may conclude, wrongly, that the gate hasn't moved — silently defeating the one safeguard this
comment exists to provide. This is a documentation-accuracy defect that directly affects the
declared reliability of a test invariant, not a style nit.
**Fix:** Update both citations to the current location and re-verify them whenever `renderKeyRow`
is edited above the gate:
```diff
- * gate (`screens/Humble/Keys/index.tsx:421-424`) requires `!ownedElsewhere`
+ * gate (`screens/Humble/Keys/index.tsx:456-459`) requires `!ownedElsewhere`
```
```diff
- * `screens/Humble/Keys/index.tsx:421-424`. It is a mirror, not the article
+ * `screens/Humble/Keys/index.tsx:456-459`. It is a mirror, not the article
```

## Info

### IN-01: Additional stale line-number citations pointing at unrelated code

**File:** `src/common/humble/keyTypePresentation.ts:9-11`, `src/backend/humble/library.ts:876`
**Issue:** Same pattern as WR-02, lower stakes since these are general "see roughly here" prose
pointers rather than a declared exact-boundary mirror. `keyTypePresentation.ts:9` cites
`HumbleKeyRow/index.tsx:230` as the "raw lowercase token in the caption" call site; that line is
now inside `resolveKeyScenario`'s parameter destructuring, unrelated to caption rendering.
`library.ts:876` cites `HumbleKeyRow/index.tsx:116` as "the D-77 Undo affordance... gated on
`redeemedAt !== null`"; that line is now the JSDoc comment for the `settleAction` prop, not the
Undo affordance's render site. Neither miscitation affects behavior, but both will send a reader
chasing the wrong code when investigating those comments' claims.
**Fix:** Re-point both citations to their current locations the next time either comment is
touched; not urgent enough to warrant a dedicated pass on its own.

---

_Reviewed: 2026-09-29T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
