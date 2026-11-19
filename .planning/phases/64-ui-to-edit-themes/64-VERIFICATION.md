---
phase: 64-ui-to-edit-themes
verified: 2026-11-19T23:00:00Z
status: gaps_found
score: 7/8 must-haves verified
covered_files:
  - ".planning/phases/64-ui-to-edit-themes/64-01-PLAN.md"
  - ".planning/phases/64-ui-to-edit-themes/64-01-SUMMARY.md"
  - ".planning/phases/64-ui-to-edit-themes/64-02-PLAN.md"
  - ".planning/phases/64-ui-to-edit-themes/64-02-SUMMARY.md"
  - ".planning/phases/64-ui-to-edit-themes/64-03-PLAN.md"
  - ".planning/phases/64-ui-to-edit-themes/64-03-SUMMARY.md"
  - ".planning/phases/64-ui-to-edit-themes/64-04-PLAN.md"
  - ".planning/phases/64-ui-to-edit-themes/64-04-SUMMARY.md"
  - ".planning/phases/64-ui-to-edit-themes/64-05-PLAN.md"
  - ".planning/phases/64-ui-to-edit-themes/64-05-SUMMARY.md"
  - ".planning/phases/64-ui-to-edit-themes/64-06-PLAN.md"
  - ".planning/phases/64-ui-to-edit-themes/64-06-SUMMARY.md"
  - ".planning/phases/64-ui-to-edit-themes/64-07-PLAN.md"
  - ".planning/phases/64-ui-to-edit-themes/64-07-SUMMARY.md"
  - ".planning/phases/64-ui-to-edit-themes/64-08-PLAN.md"
  - ".planning/phases/64-ui-to-edit-themes/64-08-SUMMARY.md"
  - ".planning/phases/64-ui-to-edit-themes/64-09-PLAN.md"
  - ".planning/phases/64-ui-to-edit-themes/64-09-SUMMARY.md"
  - ".planning/phases/64-ui-to-edit-themes/64-10-PLAN.md"
  - ".planning/phases/64-ui-to-edit-themes/64-10-SUMMARY.md"
  - "src/frontend/components/UI/ThemeSelector/ThemeGallery.tsx"
  - "src/frontend/customThemes/applyTheme.ts"
  - "src/frontend/customThemes/validate.ts"
  - "src/frontend/index.tsx"
  - "src/frontend/screens/Accessibility/ThemeEditor/index.tsx"
  - "src/frontend/state/settingsState.ts"
covered_digest: "v4:sha256:5a9d06197192eb5d62f39f6090aea38cd28429c0d932c8755f566374f7d674f2"
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "No gradient value that could fetch from the network is ever stored, applied or painted (plan 64-04 / 64-08 must-have intent; threats T-64-12 and T-64-21, both rated high and recorded closed in 64-SECURITY.md)"
    status: failed
    reason: "isValidGradient (src/frontend/customThemes/validate.ts:13-40) tests only a denylist, a leading *-gradient( and a trailing ')'. It never confines the value to ONE gradient layer. A second comma-separated layer such as `linear-gradient(red, blue), image-set(\"https://attacker.example/p.png\" 1x)` contains no `url(`, so GRADIENT_DENY does not match, and it passes. Reproduced by this verifier with an injected supports()=>true: isValidGradient and isValidTokenValue both returned true for that payload. The code review (64-REVIEW.md CR-01) confirmed CSS.supports returns true for it in a real WKWebView, and the CSP allows img-src https:. The value is reachable from stored config.json (parseCustomThemes -> cleanTokens -> applyTheme sets it on body, so a fetch on every start) and from typing into the Advanced GradientField (paints into the preview strip with no Save). The literal plan wording (reject var(, url(, ;, {, }, @, !important, backslash) is met; the stated purpose of those rules is not."
    artifacts:
      - path: "src/frontend/customThemes/validate.ts"
        issue: "GRADIENT_DENY omits image-set(, -webkit-image-set(, cross-fade(, element(, src( and quoted strings; no single-layer check"
      - path: "src/frontend/screens/Accessibility/ThemeEditor/GradientField.tsx"
        issue: "Paints lastValid into backgroundImage as soon as isValidGradient accepts it"
    missing:
      - "Refuse image-set(/cross-fade(/element(/src( and quote characters, and require the gradient's opening paren to close at the last character (one layer only); fix proposed in 64-REVIEW.md CR-01"
      - "Regression cases in validate.test.ts for image-set(\"...\"), -webkit-image-set(\"...\") and the multi-layer form, using an injected supports that returns true (jsdom has no CSS.supports, so the existing tests cannot catch this)"
      - "Reopen T-64-12 and T-64-21 in 64-SECURITY.md until fixed (currently status verified, threats_open 0, which this finding contradicts)"
---

# Phase 64: UI to edit themes Verification Report

**Phase Goal:** Users can make their own theme by copying a built-in one and editing its colours, without the built-in themes ever changing (gallery of thumbnails from real token values; Duplicate seeds resolved tokens, built-ins read-only, token editor with swatch and value and live thumbnail; saved custom themes in the selector, applied app-wide, stored as token data, `window.setTheme` custom-theme branch).
**Verified:** 2026-11-19
**Status:** gaps_found
**Re-verification:** No, initial verification

## Goal Achievement

The user-facing goal is achieved and was exercised live. One security must-have intent (no network fetch from a stored or typed gradient) is not met because of a reproduced validator bypass. It is a single, narrow gap; nothing in the gallery, Duplicate, editor or apply path is broken.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Theme gallery: a thumbnail for every theme, drawn from that theme's real token values | VERIFIED | `ThemeGallery.tsx` renders a Built-in group (10 cards) and a Your themes group; `ThemeCard.tsx:53` renders `ThemeThumbnail tokens={tokens} base={base}`. `builtinTokens.generated.json` has all 10 built-in seeds (83-100 tokens each); `gen:theme-tokens --check` reports up to date. Mounted in `Accessibility/index.tsx:153`. Live UAT 1, 2, 6 pass (Nord Light thumbnail button matches real #81a1c1). |
| 2 | Duplicate creates a custom theme seeded with the source's resolved token values (var() chains followed) | VERIFIED | `settingsState.ts:141-170`: built-in source -> `builtinSeed(key)` (generated from `themes.scss` + `_colors.scss` with var() resolved), copy built by `makeCopy`, persisted to `customThemes`. UAT 3 pass. |
| 3 | The 10 built-in themes are read-only | VERIFIED | `src/frontend/themes.scss` last commit `df0eb21b9` (pre-phase), no diff. Setters look the id up in `customThemes` first and refuse built-in/unknown ids (`settingsState.ts:172`); zero-write tests for `nord-light` pass. `isBuiltInThemeKey` own-property check. |
| 4 | The copy opens a token editor listing each token with a colour swatch and value; the copy's thumbnail updates as values change | VERIFIED | Route lazy-loaded at `App.tsx:324`; `TokenRow.tsx` -> `ColourField` (swatch, alpha picker, validated text input); `PreviewPane.tsx` renders `ThemeThumbnail tokens={draft}`. UAT 3, 4, 9 pass; 20 theme suites (331 tests) re-run green by this verifier. |
| 5 | Saved custom themes appear in the selector beside the built-ins and apply app-wide | VERIFIED | Your themes group in `ThemeGallery.tsx:92`; `saveCustomThemeTokens` persists via confirmed `setChecked` then `window.setTheme` (`settingsState.ts:208-221`); `applyTheme` sets base class plus inline custom properties on `<body>`. UAT 5 (applied app-wide incl. MUI dialogs, genre tags, context menus) and UAT 7 (persists across restart) pass. |
| 6 | Custom themes are stored as token data, not CSS files | VERIFIED | `customThemes` key in config store holds `{id, name, base, tokens}` (`common/types/customTheme.ts`, allow-listed at `storePolicy.ts:110`); no CSS-file path. |
| 7 | `window.setTheme` has a custom-theme branch again | VERIFIED | `src/frontend/index.tsx:322-324` parses stored `customThemes` and calls `applyTheme(document.body, key, customs, DEFAULT_THEME_KEY)`; `applyTheme.ts` branches builtin / custom / unknown (fallback). Boot calls `window.setTheme(themeClass)` at line 356. |
| 8 | No stored or typed gradient can trigger a network fetch (T-64-12, T-64-21; intent of 64-04 and 64-08 gradient must-haves) | FAILED | See gap above. Reproduced bypass; reviewer confirmed in WKWebView. |

**Score:** 7/8 truths verified (0 present, behavior-unverified)

### Effect of CR-01 on the plans' claims

- Plan 64-04 must-have "No colour or gradient value that fails validation is ever stored or applied; gradients containing var(, url(, ... are rejected": the listed-token clause holds; the layered `image-set("https://...")` value "passes validation" yet is a network-fetching value the control exists to stop. The security intent fails.
- Plan 64-08 must-have "Gradient tokens ... accepted only when CSS.supports validates them after rejecting var(, url(, ...": same reading.
- 64-SECURITY.md records T-64-12 and T-64-21 as `closed` and `threats_open: 0` ("ASVS L1 grep-depth; plan-time register, auditor short-circuited"). That audit confirmed the denylist exists, not that it is sufficient. The record is overstated and should be reopened until CR-01 is fixed. Live UAT 10 only tried a plain `url()`, which the denylist does catch.
- Severity in context: the payload needs the user to paste it into Advanced or a hand-edited/planted `config.json`, so it is local-trust, not remote. It is still a high-rated threat with a failed control, so it stays a gap rather than a warning. The decision to fix now or accept as a known risk is the developer's; no override is applied.

### Deferred Items

None. No later milestone phase covers gradient validation.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/frontend/customThemes/builtinTokens.generated.json` | seeds for 10 built-ins | VERIFIED | 10 keys, drift check clean |
| `src/frontend/customThemes/applyTheme.ts` | custom branch behind setTheme | VERIFIED | wired in `index.tsx`, `settingsState.ts` |
| `src/frontend/customThemes/validate.ts` | colour/gradient validation | VERIFIED substantive, GAP on gradient logic | CR-01 |
| `src/frontend/components/UI/ThemeSelector/{ThemeGallery,ThemeCard,ThemeThumbnail}.tsx` | gallery | VERIFIED | wired into Accessibility screen |
| `src/frontend/screens/Accessibility/ThemeEditor/*` | token editor, live preview, Save | VERIFIED | routed at `App.tsx:324` |
| `src/frontend/state/settingsState.ts` | custom-theme setters | VERIFIED | Duplicate/Rename/Delete/Save present |
| `sidecar:store-set-checked` channel | confirmed write | VERIFIED | in `ipc_contract.rs:705`; `customThemes` allow-listed; check:ipc-contract clean (orchestrator) |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `index.tsx` setTheme | `applyTheme` | direct call with parsed stored themes | WIRED |
| Save in editor | store + body | `setChecked` -> `set` -> `window.setTheme` | WIRED |
| Duplicate button | `duplicateTheme` -> `customThemes` -> gallery | store setter, zustand state | WIRED |
| Editor draft | `PreviewPane` -> `ThemeThumbnail` | `draft` tokens prop | WIRED |
| Built-in SCSS | seeds JSON | `meta/genThemeTokens.ts` | WIRED (`--check` clean) |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| ThemeCard thumbnail | tokens | `builtinSeed` / `customThemes` store | Yes | FLOWING |
| Editor preview | draft | user edits over seeded copy | Yes | FLOWING |
| Body styling | tokens | persisted `customThemes` | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Theme suites | `npx jest src/frontend/customThemes src/frontend/components/UI/ThemeSelector src/frontend/screens/Accessibility/ThemeEditor src/frontend/state/__tests__/customThemesState.test.ts` | 20 suites, 331 tests pass | PASS |
| Seeds not drifted | `pnpm gen:theme-tokens --check` | "up to date" | PASS |
| CR-01 reproduction | throwaway jest case, injected `supports => true` (removed after run) | isValidGradient and isValidTokenValue true for the layered image-set payload | FAIL (confirms gap) |

Full-suite, codecheck, lint and ratchet results (22866 passed, 5 baseline failures, 0 fresh) were taken from the orchestrator and not re-run.

### Probe Execution

Step 7c: SKIPPED (no probes declared by this phase).

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|--------------|-------------|--------|----------|
| THEME-01 | 64-02, 64-03, 64-04, 64-07, 64-08 | Browse every theme in a gallery of preview thumbnails | SATISFIED | Truth 1; UAT 1, 2, 6 |
| THEME-02 | 64-01 to 64-06, 64-08 to 64-10 | Duplicate a theme and edit its colours; built-ins never change | SATISFIED | Truths 2-7; UAT 3-11 |

Both IDs appear in plan frontmatter and in REQUIREMENTS.md (lines 45-46 and traceability 89-90, marked Complete). No orphaned requirements: no other REQUIREMENTS.md ID maps to Phase 64. The gap above concerns a security property, not either requirement's text.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `validate.ts` | 13-40 | Denylist-only gradient check (CR-01) | BLOCKER | Network fetch via layered image-set |
| `GradientField.tsx` / `customTheme.ts` / `settingsState.ts` | 59-81 / 79-81 / 208-219 | >512-char gradient dropped on Save yet "Saved" shown (WR-02) | WARNING | Silent edit loss in an edge case |
| `ThemeEditor/index.tsx` | 79-82 | Navigating away mid-save loses draft; failure notice then says changes "still here" (WR-01) | WARNING | Edge-case data loss and wrong message |
| `settingsState.ts` | 208-219 | Pre-await snapshot can undo concurrent rename/delete (WR-03) | WARNING | Race, low likelihood |
| `settingsState.ts` | 141-195 | Duplicate/Rename/Delete use unconfirmed `configStore.set` (WR-04) | WARNING | Divergence from D-05 under read-only store |
| `customTheme.ts` | 196 | Impossible-state guard (WR-05) | INFO | Necessity nit |
| various | | IN-01 to IN-06 | INFO | See 64-REVIEW.md |

No TBD/FIXME/XXX markers in the phase's source files.

### Human Verification Required

None outstanding. Operator-run live UAT covers 16 of 17 items (pass); item 15 (grid usability at 50 themes) was skipped by the operator, with the limit dialog covered by passing unit tests. The skipped visual check is a minor residual, not a blocker.

### Housekeeping Note

`.planning/ROADMAP.md` still shows Phase 64 as `[ ]` with "0 plans; not started" in the milestone list (line 155) and "9/10 plans executed" in the phase section (line 529), although all 10 plans have SUMMARYs and REQUIREMENTS.md marks both IDs Complete. The orchestrator's close-out should reconcile these.

### Gaps Summary

One gap, from one root cause: `isValidGradient` guards against the literal `url(` but not against other constructs that fetch (`image-set("...")`, `-webkit-image-set`, `cross-fade`, `element`, `src`) because it does not restrict the value to a single gradient layer. This weakens the phase's own stated mitigation for T-64-12 and T-64-21 and makes the `closed` / `threats_open: 0` status in 64-SECURITY.md inaccurate. A closure plan should apply the validator fix from 64-REVIEW.md CR-01, add regression tests with an injected `supports`, and reopen then re-close the two threats. WR-01 through WR-04 are non-blocking and can be batched into the same closure plan or triaged separately; 64-REVIEW-DISPOSITION.md currently has all 12 findings at `open`.

---

_Verified: 2026-11-19_
_Verifier: Claude (gsd-verifier)_
