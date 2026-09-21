---
phase: quick-260921-pec
plan: 01
subsystem: planning/todos
tags: [wkwebview, measurement, triage, docs-only]
requirements: [QUICK-260921-PEC]
key-files:
  modified:
    - .planning/todos/pending/2026-09-20-the-bare-dialog-class-is-never-applied-to-any-element.md
    - .planning/todos/pending/2026-09-20-dialog-styledpaper-logs-wrapper-rule-has-a-stray-paren.md
    - .planning/todos/pending/2026-09-20-steam-key-dialog-input-has-no-css-rule-at-all.md
decisions:
  - "bare-.Dialog margin todo re-triaged live-gate -> code: cascade question now measured, remainder is desk decision"
  - "stray-paren todo kept at live-gate, deliberately, narrowed to the single remaining user-visible question"
  - "Steam-key input todo re-triaged live-gate -> human: nothing left to measure, remainder is a design decision"
metrics:
  duration: "~25 min"
  completed: 2026-09-21
---

# Quick 260921-pec: Record the live WKWebView measurements Summary

Folded a compiled-Swift WKWebView probe's findings (`evidence/wkresults.json`) into the three
pending Dialog todos filed by `260921-nub`, correcting one claim that the source-only reasoning
had understated, and re-triaging two of the three `ready:` keys now that the open question each
carried has been measured.

## What changed, per file

**`2026-09-20-the-bare-dialog-class-is-never-applied-to-any-element.md`**
- Corrected the central claim: `.anticheatInfo` loses **all four** margins (not two) because the
  whole `margin` shorthand is invalid at computed-value time; `.installWrapper` keeps its `16px`
  block margins because `margin-block: 1rem` is a separate, independently-surviving declaration.
- Added a dated `## Measured live under WKWebView` section: method, the as-shipped vs
  positive-control margin table, the `tokenAtRoot`/`tokenAtBody` blank-vs-`sanity_spaceMd` control,
  the scope limit, and an explicit warning that `elementsCarryingBareDialogClass: 2` is probe
  contamination (two injected positive-control wrappers), not evidence the class is applied.
  Left the pre-existing `## Why the gate stays green` (`cssTokenSweep.test.ts` blind-spot B)
  section untouched.
- `ready: live-gate` -> `ready: code`. `severity: medium` and `platform: any` unmoved.

**`2026-09-20-dialog-styledpaper-logs-wrapper-rule-has-a-stray-paren.md`**
- Frontmatter untouched: `severity: minor` / `platform: any` / `ready: live-gate` byte-identical —
  a deliberate no-op, not an oversight.
- Added the measured section: 3 rules injected, `ruleCount: 2` out (one-rule blast radius now
  measured, not just reasoned); the sentinel after the malformed rule still applied; the
  `:has(.logs-wrapper)` control rule fired on a matching element, proving the target would have
  matched; `CSS.supports('selector(:has(.x))')` is `true` (not an engine gap); the malformed
  selector throws `SyntaxError` in `querySelector`.
- Rewrote the readiness prose to NARROW rather than remove the gate: the mechanism half is now
  settled and dropped from scope; the only remaining open question is whether the Settings log
  dialog actually overflows on a short window, which needs a live viewport run this harness could
  not perform.

**`2026-09-20-steam-key-dialog-input-has-no-css-rule-at-all.md`**
- Added the measured section: every painted property (`backgroundColor`, `color`,
  `borderTopWidth/Style/Color`, `borderRadius`, `paddingTop`, `paddingLeft`, `fontFamily`,
  `fontSize`) is byte-identical to a pristine input; only `width`/`height` differ, from
  inherited/global box model, not a targeting rule; `.Dialog__footer` method control read
  `display: flex`, proving the method can detect real styling.
- `ready: live-gate` -> `ready: human`. `severity: minor` and `platform: any` unmoved. Nothing is
  left to measure; what remains is a design decision, not a live run or an edit.

## Deviations from Plan

None — plan executed exactly as written. One pre-existing oddity was noted but deliberately left
alone as out of scope: all three original todo files ended with a stray literal `</content>` line
(confirmed present at HEAD via `git show`, not a tool-output artifact). Since the plan's scope is
folding in the measurement and re-triaging, not general cleanup, this line was preserved unchanged
in all three rewritten files to avoid an unrelated diff.

## Verification (verbatim)

**Task 1 verify:** `PASS1`... exact output: `PASS1` from the compound assertion (scope fence,
frontmatter `severity: medium|platform: any|ready: code|`, `## Measured live under WKWebView`
section present, evidence path present, `elementsCarryingBareDialogClass` present, `margin-block`
present).

**Task 2 verify:** `PASS2` from the compound assertion (scope fence, both files' frontmatter exact
match, both `## Measured live under WKWebView` sections + evidence path present, `ruleCount` in the
stray-paren file, `Dialog__footer` in the Steam-key file).

**Task 3 verify — scope fence and per-file frontmatter/section check:**
```
rc-so-far=0
```
(no FAIL lines emitted; `git diff --quiet -- src/ src-tauri/` exited 0, no file appeared under
`.planning/todos/completed/`, and all three frontmatter blocks matched their expected
`severity|platform|ready` strings exactly, each with the `## Measured live under WKWebView`
section and full evidence path present.)

**`git status --porcelain` before commits:**
```
 M .planning/todos/pending/2026-09-20-dialog-styledpaper-logs-wrapper-rule-has-a-stray-paren.md
 M .planning/todos/pending/2026-09-20-steam-key-dialog-input-has-no-css-rule-at-all.md
 M .planning/todos/pending/2026-09-20-the-bare-dialog-class-is-never-applied-to-any-element.md
?? .planning/quick/260921-pec-record-the-live-wkwebview-measurements-i/
```

**`pnpm planning-gates` (verbatim tail):**
```
[PASS] .planning/phases/34.2-tauri-ipc-re-plumb-slice-5-game-details-settings-and-overrid/currency-gate.py
[PASS] .planning/phases/34.3-tauri-ipc-re-plumb-slice-6-shell-files-logs-and-diagnostics/ported-channels-gate.py
[PASS] .planning/phases/34.4-tauri-ipc-re-plumb-slice-7-steam-completion-and-humble/ported-channels-gate.py
[PASS] .planning/phases/34.4.1-tauri-embedded-browser-login-seam-replace-the-electron-webvi/ported-channels-gate.py
[PASS] .planning/phases/34.4.1-tauri-embedded-browser-login-seam-replace-the-electron-webvi/seam-parity-sweep-gate.py
[PASS] .planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/ported-channels-gate.py
[PASS] .planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/preload-surface-gate.py
[PASS] .planning/phases/40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we/model-a-retirement-gate.py
[PASS] .planning/planning-frontmatter-gate.py
[PASS] .planning/todos/todo-frontmatter-gate.py
[PASS] .planning/uat-visibility-gate.py

11/11 planning gates passed.
```
Matches the baseline of 11/11 measured at HEAD `0188b54a9` before any edit.

## Self-Check

- `.planning/todos/pending/2026-09-20-the-bare-dialog-class-is-never-applied-to-any-element.md` — FOUND
- `.planning/todos/pending/2026-09-20-dialog-styledpaper-logs-wrapper-rule-has-a-stray-paren.md` — FOUND
- `.planning/todos/pending/2026-09-20-steam-key-dialog-input-has-no-css-rule-at-all.md` — FOUND
- Commit `44a6f3720` — FOUND in `git log`
- Commit `cb7f1af86` — FOUND in `git log`

## Self-Check: PASSED

## Commits

- `44a6f3720` — docs(quick-260921-pec): fold live WKWebView measurement into the bare-.Dialog todo
- `cb7f1af86` — docs(quick-260921-pec): narrow the stray-paren live gate, re-triage the Steam-key input todo
</content>
