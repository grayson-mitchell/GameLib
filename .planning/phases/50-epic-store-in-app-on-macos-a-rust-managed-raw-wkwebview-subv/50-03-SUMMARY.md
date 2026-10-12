---
phase: 50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv
plan: 03
subsystem: ui
tags: [react, i18n, i18next-parser, webview, epic-store]

requires:
  - phase: 50-01
    provides: the wave-2 dependency this plan's `depends_on` names (UI-SPEC/PATTERNS groundwork)
provides:
  - "StoreEmbedTimeoutBanner.tsx: D-07 slow-load banner, no loading state of its own, renders only when `timedOut` is true"
  - "EpicLauncherBlockedNotice.tsx: D-14 blocked-launcher-scheme notice, bounded-width row under StoreEmbedControls, auto-dismissing"
  - "WebviewUnavailablePanel.tsx: new 'epic-challenged' reason (D-10/D-11) with a Try again button"
  - "6 new en/gamelib.json keys minted by pnpm i18n; 48 non-English catalogues deliberately left red (288 hard failures) for plan 04 to fill"
affects: ["50-02", "50-04", "50-05"]

actuals:
  tokens: 14532
  tasks: 4
  commits: 3
  plan_head_before: ea3edba9d4d4269bac91730b24bc01d99a0b3d26
  plan_head_after: e4481c2bc5be4b498b9f64f10c81c9e15425b19d

tech-stack:
  added: []
  patterns:
    - "i18next-parser can only mint a key from a LITERAL string as tGamelib's first argument -- a Record<Reason, {key}> lookup table indirecting through a property access is invisible to it. Use per-branch literal ternaries, never a lookup table, for any tGamelib call site with more than one possible key."

key-files:
  created:
    - src/frontend/screens/WebView/components/StoreEmbedTimeoutBanner.tsx
    - src/frontend/screens/WebView/components/EpicLauncherBlockedNotice.tsx
    - src/frontend/screens/WebView/components/__tests__/StoreEmbedTimeoutBanner.test.tsx
    - src/frontend/screens/WebView/components/__tests__/EpicLauncherBlockedNotice.test.tsx
  modified:
    - src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx
    - src/frontend/screens/WebView/components/__tests__/WebviewUnavailablePanel.test.tsx
    - src/frontend/screens/WebView/index.css
    - public/locales/en/gamelib.json
    - meta/i18nGateScope.json
    - meta/i18nForkTouchedFiles.json
    - meta/__tests__/genI18nGateScope.test.ts

key-decisions:
  - "D-10 heading (Task 1, Decision 1): Option 1B (not the UI-SPEC's recommended 1A draft) -- heading reads \"Epic Store browsing is temporarily blocked\", distinct from the locked body sentence. Rationale (coordinator): matches the restrained, non-accusatory tone the other two reasons already use and avoids the recommended draft's stronger implication that Epic itself is at fault."
  - "D-14 placement (Task 1, Decision 2): Option 2A -- bounded-width notice row in the chrome stack under StoreEmbedControls, auto-dismissing, same copy/accent/icon as UI-SPEC A3 specified, just relocated off the floating-toast shape because a floating toast cannot paint above the native Epic subview without hiding it first (Skill(\"spike-findings-gamelib\")). Rationale: keeps the subview visible for the full duration of a transient, one-shot notice, which the original A3 shape could not do."
  - "Reverted a REASON_COPY lookup-table refactor of WebviewUnavailablePanel's heading/body derivation back to literal three-way ternaries after pnpm i18n silently failed to mint epic-challenged.heading/.body through the lookup indirection -- i18next-parser requires a literal string at the tGamelib call site."
  - "Declared 4 unrelated fork-touched files (LibraryTileSizeSlider/index.tsx, shortcutsToggle.ts, libraryTileSize.ts, storeEmbedZoom.ts) as debt in genI18nGateScope.test.ts's DECLARED_UNSCANNED_DEBT rather than promoting them into the hand-curated meta/i18nGateScope.json -- they surfaced from the plan's mandated real `pnpm gen-i18n-gate-scope` run but this plan has not reviewed any of them for translatable surface."

patterns-established:
  - "Pattern: any WebviewUnavailableReason-keyed tGamelib derivation must use per-branch literal ternaries, never a Record lookup table -- documented directly in WebviewUnavailablePanel.tsx's doc comment so the bug is not reintroduced."

requirements-completed: []

coverage:
  - id: D1
    description: "D-07 slow-load banner: renders only when timedOut is true, no spinner, offers Reload + Open in browser on one row at minimum window width"
    verification:
      - kind: unit
        ref: "src/frontend/screens/WebView/components/__tests__/StoreEmbedTimeoutBanner.test.tsx"
        status: pass
    human_judgment: true
    rationale: "Single-row-at-minimum-width and longest-of-49-translations layout truths are visual/backstop criteria -- unit tests cover props/callback wiring and copy, not rendered geometry."
  - id: D2
    description: "D-14 blocked-launcher notice: bounded-width row under StoreEmbedControls, auto-dismissing, HumbleExpiryToast-style icon + message + --status-warning accent, logged once per navigation attempt"
    verification:
      - kind: unit
        ref: "src/frontend/screens/WebView/components/__tests__/EpicLauncherBlockedNotice.test.tsx"
        status: pass
    human_judgment: true
    rationale: "Visible-at-minimum-window-width wrapping criterion is a backstop/visual truth; the component is not yet wired to a live navigation attempt (plan 05's job) so the once-per-attempt behavior cannot be exercised end-to-end here."
  - id: D3
    description: "WebviewUnavailablePanel 'epic-challenged' reason: chosen heading/body copy, Try again button rendered only with onTryAgain present, DOM order Try-again-before-Open-in-browser, existing reasons unaffected"
    verification:
      - kind: unit
        ref: "src/frontend/screens/WebView/components/__tests__/WebviewUnavailablePanel.test.tsx"
        status: pass
    human_judgment: false
  - id: D4
    description: "Six new en/gamelib.json keys minted by pnpm i18n (epic-challenged.heading/.body/.tryAgain, epicEmbed.timeout.message/.reload, epicEmbed.launcherBlocked.message); second pnpm i18n run is a true no-op; 48 non-English catalogues deliberately left red (288 hard failures recorded as the expected control for plan 04)"
    verification:
      - kind: other
        ref: "pnpm i18n (no-op confirmed) + pnpm lint-translations:gamelib (288 failures / 48 locales, recorded below)"
        status: pass
    human_judgment: false

duration: 23min (measured from the first task commit, 21:27:24, to the last task commit, 21:50:14, both +1300; Task 1's checkpoint deliberation time is not captured in this measurement)
completed: 2026-10-12
status: complete
---

# Phase 50 Plan 03: Epic Store Chrome Components and i18n Mint Summary

**Added the D-07 slow-load banner, the D-10/D-11 `'epic-challenged'` panel reason with its Try again button, and the D-14 blocked-launcher notice as three pure, props-driven React components, then minted their six English strings while deliberately leaving the 48 non-English catalogues red as plan 04's control.**

## Performance

- **Duration:** 23 min (Task 2 through Task 4 commit span; Task 1's checkpoint wait is not included)
- **Completed:** 2026-10-12
- **Tasks:** 4/4 (Task 1 checkpoint:decision, Task 2 auto/tdd, Task 3 auto/tdd, Task 4 auto)
- **Files modified:** 11 (7 source/test, 1 CSS, 3 i18n/meta manifests)

## Accomplishments

- Shipped `StoreEmbedTimeoutBanner.tsx` and `EpicLauncherBlockedNotice.tsx` as new, hookless-besides-`useTranslation`, props-driven chrome components, each with a dedicated test file following the invoke-as-a-plain-function convention.
- Extended `WebviewUnavailablePanel`'s `reason` union to a third value, `'epic-challenged'`, with its own Try again button gated on `onTryAgain` being present -- no dead control ever renders.
- Resolved Task 1's two UI-SPEC assumption checkpoints (heading wording and notice placement) with the coordinator before any string was written, avoiding a 48-translation re-author.
- Minted exactly 6 new English keys via `pnpm i18n`, confirmed the second run is a true no-op, and recorded the expected 288-hard-failure / 48-locale red control that plan 04 is scoped to turn green.
- Registered both i18n gate manifests (`meta/i18nGateScope.json`, `meta/i18nForkTouchedFiles.json`) for the two new components, and kept the real `pnpm gen-i18n-gate-scope` regeneration scoped to this plan's own files by declaring 4 unrelated surfaced files as debt rather than reviewing/promoting them.

## Task Commits

1. **Task 1: Confirm the challenged-panel heading and the blocked-launcher notice placement** - checkpoint:decision, resolved by the coordinator prior to this execution segment; no code commit (decision recorded below).
2. **Task 2: Add the slow-load banner and blocked-launcher notice components** - `348e28057` (feat, TDD)
3. **Task 3: Add the epic-challenged reason to WebviewUnavailablePanel** - `cd1dd4e3b` (feat, TDD)
4. **Task 4: Mint i18n keys and register gate manifests** - `e4481c2bc` (feat)

**Plan metadata:** (final commit recorded separately below, after this SUMMARY is written)

_Note: Tasks 2 and 3 are TDD tasks; each landed as a single commit per this repo's existing convention for these component/test pairs, matching the shape of the prior Phase 50 plan commits in this same series._

## Files Created/Modified

- `src/frontend/screens/WebView/components/StoreEmbedTimeoutBanner.tsx` - new D-07 banner, renders only when `timedOut` is true
- `src/frontend/screens/WebView/components/EpicLauncherBlockedNotice.tsx` - new D-14 notice, bounded-width row, auto-dismissing
- `src/frontend/screens/WebView/components/__tests__/StoreEmbedTimeoutBanner.test.tsx` - new test file
- `src/frontend/screens/WebView/components/__tests__/EpicLauncherBlockedNotice.test.tsx` - new test file
- `src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx` - added `'epic-challenged'` reason, `onTryAgain` prop, Try again button
- `src/frontend/screens/WebView/components/__tests__/WebviewUnavailablePanel.test.tsx` - 8 new tests for the `'epic-challenged'` reason, extended `mintedKeyPaths` and fallback-equality checks
- `src/frontend/screens/WebView/index.css` - CSS rules for both new components, token-table-driven
- `public/locales/en/gamelib.json` - 6 new keys minted by `pnpm i18n` (clean 14-line insertion, 0 deletions, scoped to this plan's commit range)
- `meta/i18nGateScope.json` - registered `StoreEmbedTimeoutBanner.tsx` and `EpicLauncherBlockedNotice.tsx` (hand-edit, not a generator run; `WebviewUnavailablePanel.tsx` was already present)
- `meta/i18nForkTouchedFiles.json` - regenerated for real via `pnpm gen-i18n-gate-scope` (251 -> 257 files)
- `meta/__tests__/genI18nGateScope.test.ts` - updated hardcoded fixture counts (209->211 scope, 251->257 fork-touched) and `DECLARED_UNSCANNED_DEBT`, per this file's established maintenance convention

## Decisions Made

**Task 1, Decision 1 (D-10 heading, UI-SPEC Assumption A2) — Option 1B:**
Chosen heading text, verbatim: **"Epic Store browsing is temporarily blocked"**
Body stays exactly as D-10 locked it (unchanged by this decision): "Epic asked for a security check this view can't complete."
Rationale: the coordinator selected a custom wording over the UI-SPEC's recommended Option 1A draft ("Epic needs a security check this view can't pass") to keep the heading in the same restrained, non-accusatory register as the panel's other two reasons, rather than the stronger-sounding draft phrasing.

**Task 1, Decision 2 (D-14 notice placement, UI-SPEC Assumption A3) — Option 2A:**
The blocked-launcher notice renders as a bounded-width row in the same notice stack under `StoreEmbedControls` as the D-07 banner — not as a floating toast. Auto-dismisses after a short interval (D-14 names no dismiss control and the notice is one-shot per attempt). Copy: "Install from your Library instead — this view can't open the Epic Games Launcher." Same `--status-warning` accent and warning icon as UI-SPEC A3 specified. Logged once per navigation attempt.
Rationale: a floating toast over the Stores tab cannot paint above the native Epic WKWebView subview without first hiding it (`useSuppressStoreEmbedWhile`, the same mechanism `HumbleExpiryToast` already uses) — making the Epic store vanish for a transient notice about a blocked link is a worse outcome than the notice itself. The notice-stack region sits above the slot rect by construction (Phase 40 D-24), so it never collides with the embed.

Both decisions were recorded and ruled on before Task 2 wrote any call sites, per the plan's explicit requirement (a later heading change would mean re-authoring 48 translations instead of one line).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] i18next-parser cannot statically extract a dynamically-keyed `tGamelib` call**
- **Found during:** Task 3 (WebviewUnavailablePanel epic-challenged reason)
- **Issue:** Initial implementation used a `REASON_COPY: Record<WebviewUnavailableReason, {headingKey, headingFallback, bodyKey, bodyFallback}>` lookup table, with `tGamelib(copy.headingKey, copy.headingFallback)`. Running `pnpm i18n` only minted the sibling literal call (`...tryAgain`); `epic-challenged.heading` and `.body` were silently absent from the diff, because `i18next-parser`'s static extraction requires a literal string as `tGamelib`'s first argument.
- **Fix:** Removed `REASON_COPY` entirely; rewrote `heading`/`body` as explicit three-way per-branch ternaries, each a literal `tGamelib('webview.unavailable.<reason>.<field>', '<fallback>')` call. Re-ran `pnpm i18n`: all 6 keys minted cleanly.
- **Files modified:** `src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx` (doc comment also updated to record why the lookup table was rejected, so the bug is not reintroduced)
- **Verification:** `pnpm i18n` diff showed all 6 keys present; all 53 (now 61, after Task 4's additions) `WebviewUnavailablePanel.test.tsx` assertions passed, including the `mintedKeyPaths` and fallback-equality checks
- **Committed in:** `cd1dd4e3b` (part of Task 3's commit)

**2. [Rule 1/3 - Blocking issue, required by this plan's own mandated action] Real `pnpm gen-i18n-gate-scope` regeneration broke 5 hardcoded test assertions**
- **Found during:** Task 4 (mint keys, register gate manifests)
- **Issue:** `meta/__tests__/genI18nGateScope.test.ts` hardcodes `files.length` counts (209 scope / 251 fork-touched) as fixture assertions. Diagnosed via `git stash -u` that exactly 1 pre-existing failure (the A1 ANTI-ROT staleness check) was the documented inherited-red baseline; regenerating `meta/i18nForkTouchedFiles.json` for real (as Task 4 requires) flipped A1 to pass but broke A0, A2, A3, A4 (stale `209`/`251` literals) and the separate A-03 RATCHET test, because the real regeneration also surfaced 4 unrelated files (`LibraryTileSizeSlider/index.tsx`, `shortcutsToggle.ts`, `libraryTileSize.ts`, `storeEmbedZoom.ts`) that landed fork-touched by other, unrelated work after the 2026-10-11 snapshot.
- **Fix:** Updated the 5 hardcoded count literals (209->211, 251->257) and test-name strings; added a new dated docstring ledger entry per the file's established convention; declared the 4 unrelated files in `DECLARED_UNSCANNED_DEBT` rather than reviewing and promoting them into `meta/i18nGateScope.json` -- promoting unreviewed files into the hand-curated, blocking-gate scope is exactly the "reflex regeneration that sweeps unrelated paths in" the generator's own docstring warns against, and this plan has not reviewed any of the 4 for translatable surface.
- **Files modified:** `meta/__tests__/genI18nGateScope.test.ts`
- **Verification:** `npx jest --selectProjects Meta --testPathPattern "genI18nGateScope|hardcodedStringGate"` -- 183 passed, 1 skipped, 0 failed (confirmed twice: immediately after the fix, and again at the final committed state)
- **Committed in:** `e4481c2bc` (part of Task 4's commit)

### Plan-authoring discrepancy (not a code deviation)

Task 3's acceptance criteria states the `openExternalUrl` grep count on `WebviewUnavailablePanel.tsx` should be "still 1" after the task. It was already 2 before Task 3's edits (one doc-comment prose mention, one real call site) and remains 2 after — the real invariant (no second actual call site; T-50-12's single-chokepoint mitigation) is satisfied either way. Documented here rather than "fixed," since there was nothing to fix.

---

**Total deviations:** 2 auto-fixed (1 Rule 1 bug, 1 Rule 1/3 blocking-issue fix required by the plan's own mandated action), plus 1 documented plan-authoring discrepancy (no code change).
**Impact on plan:** Both auto-fixes were necessary for correctness (the i18n mint bug would have shipped silently-absent translation keys) and for keeping the plan's own mandated regeneration step from leaving the Meta test suite red. No scope creep: the 4 unrelated files surfaced by the real regeneration were deliberately declared as debt, not reviewed or promoted.

## Issues Encountered

None beyond the deviations documented above.

## i18n Control Measurement (expected RED — plan 04's job to turn green)

- `pnpm lint-translations:gamelib 2>&1 | grep -c 'not localised and was not recorded'` → **288**
- `pnpm lint-translations:gamelib 2>&1 | grep -o '^[a-zA-Z_]*\.gamelib\.' | sort -u | wc -l` → **48**
- This is the expected, non-vacuous control for plan 04's fill: 6 new English-only keys with no machine-filled translations yet, across 48 locale catalogues. **This is not a regression** — the next executor (plan 04) should expect this exact red state inherited and turn it green by filling the 48 catalogues.
- `meta/i18nCatalogPresenceBaseline.json` was confirmed untouched by this plan's own commit range (`ea3edba9d..HEAD`): zero commits, zero working-tree changes. (Two commits touching that file appear in a `main..HEAD` log, but both predate this plan's base commit entirely — confirmed via `git log ea3edba9d..HEAD -- meta/i18nCatalogPresenceBaseline.json`, which is empty.)
- `public/locales/en/gamelib.json` diff, scoped to this plan's own commit range (`ea3edba9d..HEAD`): 14 insertions, 0 deletions — a clean mint with no diff-shape trap (no sorted-key-insert trailing-comma side effect).

## Group 3 / Platform Gate Re-derivation Status

Confirmed NOT needed. All pre-existing tests in `WebviewUnavailablePanel.test.tsx` (the structural Group 3 gate and the three-OS platform gate) passed unchanged on the first post-fix run — the new `'epic-challenged'` reason and its tests were purely additive.

## Threat Model Compliance

All three STRIDE entries scoped to this plan's components are satisfied by the implementation as shipped:
- **T-50-11** (Information Disclosure): neither new component renders a URL.
- **T-50-12** (Tampering): the banner's Open in browser path routes through the existing single `window.api.openExternalUrl` call site `WebviewUnavailablePanel` already owns; no second external-open call site was added.
- **T-50-13** (Spoofing): every string renders as a React text child, never via `dangerouslySetInnerHTML`.
- **T-50-SC**: not armed — no package-manager install occurred in this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for plan 04 (fill the 48 non-English catalogues against the 288-failure / 48-locale red control measured above) and plan 05 (wire these three chrome components to plan 02's native signals — `timedOut`, `challenged`, the blocked-launcher-scheme count, and the Try again retry callback). No blockers.

## Self-Check: PASSED

- All 11 created/modified files confirmed present on disk.
- All 3 task commits (`348e28057`, `cd1dd4e3b`, `e4481c2bc`) confirmed present in `git log --oneline --all`.

---
*Phase: 50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv*
*Completed: 2026-10-12*
