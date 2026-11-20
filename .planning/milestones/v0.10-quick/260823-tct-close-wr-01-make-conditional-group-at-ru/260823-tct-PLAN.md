---
quick_id: 260823-tct
slug: close-wr-01-make-conditional-group-at-ru
date: 2026-08-23
description: "WR-01 (34.10 code review): close the @media/@supports bypass in the muiTabsSelectorScoping guard by making conditional group at-rules transparent for scope depth"
type: code
files_touched:
  - src/frontend/__tests__/muiTabsSelectorScoping.test.ts
  - .planning/phases/34.10-navigation-shell-horizontal-card-tabs-replace-the-sidebar/34.10-REVIEW.md
  - .planning/ROADMAP.md
---

# Quick task 260823-tct — WR-01: at-rule-wrapped selectors are still unscoped

## The finding, restated from the source

`34.10-REVIEW.md` recorded WR-01: `muiTabsSelectorScoping.test.ts`'s repo-wide guard — the
load-bearing one that prevents F-34.10-03 / F-34.10-04 recurring — is bypassable by wrapping an
unscoped `.MuiTabs-root` in `@media` / `@supports`. It was verified empirically at review time and
deferred rather than fixed, alongside CR-01 and CR-02 (both of which 34.11 has since closed under
D-31 / D-32).

## Why the bypass exists

`findUnscopedMuiTabsSelectors` (`src/frontend/__tests__/muiTabsSelectorScoping.test.ts:77`) tracks a
single `depth` counter and inspects a selector **only** when its `{` occurs at `depth === 0`:

```ts
if (ch === '{') {
  if (depth === 0) { flagSelector(...) }
  depth++
}
```

A conditional group at-rule opens a brace of its own. So in:

```css
@media (min-width: 800px) {
  .MuiTabs-root { padding-bottom: var(--space-xs); }
}
```

`@media (...)` consumes the depth-0 slot, and `.MuiTabs-root` is first seen at depth 1 — where the
scanner's own comment says a selector "is never inspected here, because nesting under any ancestor
is what 'scoped' means". But `@media` is **not an ancestor**. Per CSS, a conditional group at-rule
contributes nothing to specificity or to the matched element set; its child rule matches exactly
what it would have matched at the top level. The leak is identical, the guard is silent.

The same is true of `@supports`, `@container`, `@layer` and `@document`. `@keyframes` and
`@font-face` are NOT in this class — their contents are not selectors at all — so they stay opaque.

## Task 1 — RED first: prove the bypass against the guard as it ships

Before changing `findUnscopedMuiTabsSelectors`, add the at-rule specimens as tests and run them
against the **unmodified** scanner. They must FAIL. A guard fix whose test was never seen red is
the defect class this phase paid for repeatedly (`a-test-can-pin-the-defect-it-should-catch`);
WR-01 itself is a guard that was accepted without being proven in both directions.

Record the observed failure output in the SUMMARY. If any specimen passes RED, stop — the bypass
is not the shape the review described and the plan is wrong.

## Task 2 — make conditional group at-rules transparent for scope depth

Replace the single `depth` counter with a stack of block kinds:

- On `{`, classify the prelude: if it matches `/^@(media|supports|container|layer|document)\b/i`,
  push `'transparent'`; otherwise push `'rule'`.
- **Scope depth** = count of `'rule'` frames on the stack. Flag a selector when scope depth is 0
  and the block itself is not transparent.
- On `}`, pop.

Two correctness details the naive version gets wrong:

1. **The prelude must be the tail after the last `;`.** Today `selectorStart` is only reset when
   depth returns to 0, so a top-level declaration or SCSS variable preceding a rule (`$x: 1;` then
   `.MuiTabs-root {`) is swept into the selector text and its first compound reads `$x:`, not
   `.MuiTabs-root` — a second, independent miss. Slice the prelude at the last `;` and carry the
   offset so reported line numbers stay correct.
2. **Nesting inside a real rule still wins.** `.foo { @media ... { .MuiTabs-root {} } }` must yield
   zero offenders — scope depth is 1 there because `.foo` pushed a `'rule'` frame.

`@keyframes` / `@font-face` stay `'rule'` (opaque). They contain no class selectors, so leaving
them opaque cannot produce a false negative for this defect class, and treating them as transparent
risks false positives on percentage/`from`/`to` preludes.

## Task 3 — GREEN, and prove the fix did not widen the net

1. The Task 1 specimens go green.
2. Every pre-existing test in the file stays green **unchanged** — in particular the
   ancestor-scoped `DownloadManager/index.css` case, the `NavTabs/index.scss` comment-prose case,
   and `PRE_FIX_SPECIMEN` yielding exactly one offender at line 1.
3. The repo-wide sweep stays green. Verified before planning: no frontend stylesheet currently
   wraps a `MuiTab*` selector in an at-rule (`grep -rn "MuiTab" src/frontend --include='*.scss'
   --include='*.css'` — the only depth-0 hits are `DownloadManager/index.css`'s ancestor-scoped
   `.downloadManager > .MuiTabs-root ...`), so this tightening must not newly convict anything. If
   it does, that is a real find and gets reported, not suppressed.
4. Add a silence proof: a legitimately at-rule-wrapped but ancestor-scoped selector
   (`@media ... { .downloadManager .MuiTabs-root {} }`) yields zero offenders.

## Task 4 — record the closure

Append a dated note to `34.10-REVIEW.md` and update ROADMAP.md's 34.10 carry-forward paragraph:
WR-01 is CLOSED, with the mechanism and the RED-proof outcome. Do not restate 34.10's status — the
phase is closed and stays closed; this is a carry-forward discharge, not a reopening.

## Acceptance

- [ ] The `@media` and `@supports` specimens were observed RED against the unmodified scanner, and
      the failure output is quoted in the SUMMARY
- [ ] `findUnscopedMuiTabsSelectors` flags a depth-0-equivalent selector wrapped in any of
      `@media` / `@supports` / `@container` / `@layer` / `@document`, at the correct line number
- [ ] A selector nested inside a real rule's at-rule block yields zero offenders
- [ ] A top-level declaration or `$var: ...;` preceding an unscoped `.MuiTabs-root` no longer hides it
- [ ] All pre-existing tests in the file pass unmodified; the repo-wide sweep stays green
- [ ] `pnpm codecheck` clean for the touched file
- [ ] WR-01 recorded CLOSED in `34.10-REVIEW.md` and ROADMAP.md
