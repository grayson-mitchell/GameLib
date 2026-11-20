---
phase: quick-261011-gpn
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
  - src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss
  - .planning/todos/completed/2026-10-11-winetricks-apply-button-text-is-unreadable-in-nord-light-and-midnightmirage.md
  - .planning/todos/pending/2026-10-11-winetricks-retry-and-clear-paint-4-35-to-1-in-gruvbox-dark.md
autonomous: true
requirements: [45-12-G7]

estimate:
  tokens: 70000
  raw_tokens: 70000
  tasks: 3
  confidence: low # `estimate-calibration` is not in this gsd-sdk's registry (measured at planning: "Unknown command"), so no factor and no samples

must_haves:
  truths:
    - "The enabled Apply button's text measures >= 4.5:1 against its own fill in all 10 themes, token-resolved: midnightMirage 14.64, cyberSpaceOasis 7.77, gruvbox_dark 5.26, high-contrast 11.41, dracula 8.09, nord-light 8.88, nord-dark 11.41, marine 7.42, zombie 7.52, sweet 10.82"
    - "Disabled Apply is unchanged in every theme: transparent fill, --text-secondary text, --neutral-05 border; the gruvbox_dark override cannot reach it because its selector carries :not(:disabled)"
    - "A jest gate in themeTokens.test.ts fails if the enabled Apply pair drops below 4.5:1 in any of the 10 themes, and is proven to see the reported defect (the pre-fix pair resolves < 4.5 in nord-light and midnightMirage) and the gruvbox collision (the base pair alone resolves < 4.5 in gruvbox_dark)"
    - "src/frontend/themes.scss is byte-unchanged"
    - "The todo sits in .planning/todos/completed/ with a ## Fix section that says a pixel-sampled capture is still owed, and the gruvbox_dark residual on Retry/Clear is a new pending todo that passes pnpm planning-gates"
  artifacts:
    - path: src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss
      provides: "Enabled Apply text inverted against its --accent fill, plus a gruvbox_dark-only near-black override scoped to :not(:disabled)"
      contains: "color: var(--background, #070a0b);"
    - path: src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
      provides: "Per-theme WCAG 4.5:1 census of the enabled Apply pair, with non-vacuity and mutation proofs"
      contains: "WinetricksStickyBar__apply"
    - path: .planning/todos/completed/2026-10-11-winetricks-apply-button-text-is-unreadable-in-nord-light-and-midnightmirage.md
      provides: "Closed todo with a ## Fix section"
      contains: "## Fix (2026-10-11, quick 261011-gpn"
    - path: .planning/todos/pending/2026-10-11-winetricks-retry-and-clear-paint-4-35-to-1-in-gruvbox-dark.md
      provides: "Recorded residual: Retry and Clear share the 4.35:1 gruvbox_dark collision"
      contains: "ready: code"
  key_links:
    - from: src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
      to: src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss
      via: "read() of the stylesheet, then cssBlock(src, '.WinetricksStickyBar .WinetricksStickyBar__apply') and declsAtDepthZero for background/color"
      pattern: "WinetricksSettings/StickyBar/index\\.scss"
    - from: src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
      to: src/frontend/themes.scss + src/frontend/styles/_colors.scss
      via: "themeTokens(themesScss, selector) + globalTokens() + resolveValue(), the same var() resolver the --border-color census uses"
      pattern: "themeTokens\\(themesScss, selector\\)"
---

<objective>
Make the Winetricks sticky bar's ENABLED Apply button readable in every theme, and pin that with a per-theme WCAG gate that would have caught the 45-12 G7 defect.

The live gate measured the enabled Apply text at 1.52:1 in nord-light and 1.01:1 in midnightMirage. The orchestrator traced it (cite it, do not re-derive it): `StickyBar/index.scss` paints `background: var(--accent, #0080ff)` with the PAGE text token `--text-default` on top. That token has no relationship to `--accent`. Retry (`Row/index.scss`, `.WinetricksRow__retry`) and Clear (`EverythingElseGroup/index.scss`, `.WinetricksEverythingElse__clear`) already use the house pair, `--background` on `--accent`, and so does `styles/_buttons.scss` `.button.is-text`. Apply was the one accent-filled control that missed the Phase 44 lesson.

**Planner finding, measured at planning time.** The orchestrator's investigation did not include this, and it changes the fix. I resolved both pairs through this file's own resolver (`themeTokens` + `globalTokens` + `resolveValue` + `contrastRatio`, copied verbatim into a scratch script) across all 10 `themeSelectors`:

| theme | pre-fix pair (`--text-default` on `--accent`) | house pair (`--background` on `--accent`) |
|---|---|---|
| midnightMirage | 1.01 | 14.64 |
| cyberSpaceOasis | 1.71 | 7.77 |
| gruvbox_dark | 3.09 | **4.35, FAILS 4.5** (`#1d2021` on `#b57614`) |
| high-contrast | 1.34 | 11.41 |
| dracula | 2.41 | 8.09 |
| nord-light | 1.52 | 8.88 |
| nord-dark | 1.26 | 11.41 |
| marine | 1.95 | 7.42 |
| zombie | 1.80 | 7.52 |
| sweet | 1.55 | 10.82 |

Two consequences:

1. The defect was in every theme, not only the two the live gate sampled. At the token level the pre-fix pair fails 4.5 in all 10.
2. The house pair alone does NOT pass all 10. gruvbox_dark's `--accent` (`#b57614`) is a mid-tone. Its luminance (~0.228) means only near-black text clears 4.5:1; anything lighter than about `#1b1b1b` fails, and gruvbox's darkest token, `#1d2021`, misses by 0.15. Without handling it, the orchestrator's own gate ("all 10 themes >= 4.5") would be RED on its own fix.

**Resolution (no `themes.scss` edit, per the constraint).** Add a theme-scoped override inside the Apply rule, written as `body.gruvbox_dark &:not(:disabled)` with `color: var(--neutral-01, #070a0b)`, which measures **5.26:1**. This is the house idiom for a measured per-theme collision: NavTabs' nested `body.nord-light &` override (`NavTabs/index.scss` ~L262-292, whose comment states the rationale "a measured per-theme collision, not a general rule") and the 34.11-09 dracula-only tier-2 divider override. `tokenCensus.test.ts` admits it: the token is not banned and the `var()` has a fallback. `:not(:disabled)` is mandatory. Compiled (verified with `sass.compile` at planning), the override's selector `body.gruvbox_dark .WinetricksSettings .WinetricksStickyBar .WinetricksStickyBar__apply:not(:disabled)` is (0,5,1). Without `:not(:disabled)` it would be (0,4,1), which beats `&:disabled` at (0,4,0) and would paint near-black text on the transparent disabled button over `--input-background` `#32302f`. That swaps a 4.35 miss for a ~1.3 one.

Retry and Clear carry the same 4.35:1 in gruvbox_dark. Fixing them is OUT OF SCOPE here, and they are not the sibling todo's items either. Task 3 records them as a new pending todo, so the finding is not lost.

Purpose: close todo `2026-10-11-winetricks-apply-button-text-is-unreadable-in-nord-light-and-midnightmirage.md` (severity major). Its instruction is "fix the enabled-button token pair for every theme", so the fix covers all 10 themes, not just the two that were sampled.
Output: one SCSS rule fixed, one new describe in `themeTokens.test.ts`, the todo closed, one follow-up todo filed. Three commits.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.claude/skills/gamelib-conventions/SKILL.md
@.planning/todos/pending/2026-10-11-winetricks-apply-button-text-is-unreadable-in-nord-light-and-midnightmirage.md
@src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss

Read by line range only. These files are large, so do not read them whole:
- `src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts` (900 lines):
  - L24-68: imports, `REPO_ROOT`, `read()` (stripSourceComments), `THEMES_SCSS`, `themeSelectors`.
  - L114-138: `cssBlock()`, the first `${selector} {` block, brace-counted.
  - L417-566: `COLORS_SCSS`, `customProps`, `globalTokens`, `allBlocksFor`, `themeTokens`, `resolveValue`, `NAMED_COLOURS`, `toRgb`, `contrastRatio`.
  - L568-661: the two describes to copy. `selectedTabColourDecl` (prefer a theme-scoped override, else the base) and its "selected NavTab ... (CR-01 residual)" describe; then the "--border-color is visible in every theme" describe (object-form expect so a failure names the ratio).
  - L663-694: `declsAtDepthZero(blockBody, prop)`. It returns depth-0 declarations only, so nested `&:disabled` / `body.x &` blocks are skipped, and `color` never matches inside `border-color`.
  - The file ends at L900, after the "G-48-7" describe. All helpers are module-private `const` arrows, so the new describe MUST be appended at the END of the file. Placed earlier, a describe-level call to a later `const` would hit the TDZ, because describe bodies run at collection time.
- `src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss` L232-262 (`.WinetricksRow__retry`): the comment to echo.
- `src/frontend/components/UI/NavShell/components/NavTabs/index.scss` L262-292: the `body.nord-light &` override and its comment shape, including its "NOT LIVE-VERIFIED" paragraph.
- `.planning/todos/completed/2026-10-10-authtrigger-origin-lookup-is-an-unguarded-bracket-access.md`: the precedent for the `## Fix (...)` section and for frontmatter on close. Its frontmatter is unchanged except that `files:` gained the test path.

**Jest invocation, grounded at planning. Use this exact form.** Paths go FIRST and `--selectProjects Frontend` goes LAST:
`pnpm jest src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/tokenCensus.test.ts src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/stickyBar.test.tsx --selectProjects Frontend`
Measured at planning: this ran exactly `Test Suites: 3 passed` / `Tests: 116 passed`. The reverse order (`--selectProjects Frontend <paths>`) is a trap. `--selectProjects` is variadic, so it swallows the paths as project names and runs the WHOLE Frontend project. That was measured too: 215 suites and 3765 tests, all green, and no filter applied at all. Always confirm the `Test Suites:` line says 3.

**Branch assertion (precondition for every commit).** At planning, HEAD was `169b22062` on `quick-261002-b63`, with `main` (`e5daf3ff3`) as its ancestor. Before the first commit, assert that `git merge-base --is-ancestor 169b22062 HEAD` exits 0, and record `git branch --show-current` in the SUMMARY. If HEAD is not a descendant, halt and report. Stage explicit paths only, never `git add -A` or `.`: an untracked `.planning/milestone.lock` is present and must not be committed.
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Per-theme Apply contrast gate (RED on all 10 themes) then fix the Apply token pair, with the gruvbox_dark override (GREEN)</name>
  <files>src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts, src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss</files>
  <precondition>`git merge-base --is-ancestor 169b22062 HEAD` exits 0, and `git diff --quiet HEAD -- src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts` exits 0, so both files start clean.</precondition>
  <read_first>
    - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts: the line ranges listed in `<context>` only.
    - src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss: the whole file, 98 lines. The Apply rule is L73-85.
    - src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss L232-262
    - src/frontend/components/UI/NavShell/components/NavTabs/index.scss L262-292
  </read_first>
  <behavior>
    The new describe is appended at the end of `themeTokens.test.ts`, titled "Winetricks enabled Apply text contrast in every theme (45-12 G7)". Its tests:
    - A non-vacuity test with five checks:
      - `globals.size > 0`.
      - The Apply block resolves via `cssBlock(stickyBar, '.WinetricksStickyBar .WinetricksStickyBar__apply')`.
      - `declsAtDepthZero(applyBody, 'background')` is exactly one declaration, and it matches `var(--accent`.
      - `declsAtDepthZero(applyBody, 'color')` is exactly one declaration.
      - A `body.gruvbox_dark &:not(:disabled)` override with exactly one `color` declaration is found in the Apply block.
    - An `it.each(themeSelectors)` test: for each theme, the enabled Apply text (the theme override's `color` if one exists, else the depth-0 base `color`) resolved through `themeTokens(themesScss, selector)` + `globals` must measure >= 4.5:1 against the resolved depth-0 `background`. Both resolve non-null. Use the object-form expect `{ theme, fg, bg, ratio, passes: ratio >= 4.5 }` against the same object with `passes: true`, so a failure prints the theme and the ratio.
    - RED, on the unmodified stylesheet: all 10 per-theme cases fail (expected 1.01-3.09), and the non-vacuity test fails because the override is absent. That is 11 failing tests in the new describe; record the actual count.
    - GREEN, after the SCSS change: all new tests pass, with ratios matching the planning table (gruvbox_dark through the override at 5.26). All 3 suites in the verify command pass.
  </behavior>
  <action>
    RED first. Append the new describe to the END of `src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts`. Precede it with a JSDoc block saying four things:
    - This is the per-theme WCAG 1.4.3 census for the Winetricks sticky bar's enabled Apply button (todo 2026-10-11, live gate 45-12 G7: 1.52:1 nord-light, 1.01:1 midnightMirage).
    - It lives in this file because the cross-theme `var()` resolver and contrast helpers are module-private here. The `--border-color` census above is likewise not NavShell-specific.
    - It reads the authored declarations FROM the stylesheet, never a hardcoded copy.
    - Like every census in this file, it cannot see a pixel: no CSS engine runs under the node test environment, so a live capture still adjudicates appearance.

    Add module-level constants `WINETRICKS_STICKY_BAR_SCSS` (the repo-relative StickyBar path) and `WINETRICKS_APPLY_SELECTOR` (`.WinetricksStickyBar .WinetricksStickyBar__apply`).

    Add a helper `applyTextColourDecl(applyBody, themeClass)`, modelled on `selectedTabColourDecl` (prefer the theme override, else the base). It looks for a nested `body.<themeClass> &:not(:disabled) {...}` block inside the Apply block body. Use a regex over the body with a negated-brace inner capture, so no `s` flag is needed (see the TS1501 note at L577-578). If the block is found, the helper returns that block's single depth-0 `color` (via `declsAtDepthZero`). Otherwise it returns the single depth-0 base `color`. It throws if neither exists.

    The background is always the depth-0 `background` of the Apply block. Implement the non-vacuity and `it.each(themeSelectors)` tests exactly as `<behavior>` states. In the it.each, strip `body.` from the selector to get the theme class, as the CR-01 describe does at L604. Run the verify command BEFORE touching the SCSS and confirm the RED shape in `<behavior>`. If the per-theme cases PASS on the unmodified file, the test is reading the wrong declaration: stop and fix the test, not the SCSS.

    Then GREEN. In `src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss`, inside the `.WinetricksStickyBar .WinetricksStickyBar__apply` rule (L75-85), make two edits:
    - (a) Change the base `color:` declaration to `var(--background, #070a0b)`, per the orchestrator's required change. The fallback matches Row's Retry and Clear, and the old white fallback was itself wrong for the default-dark fallback pair.
    - (b) Insert a nested `body.gruvbox_dark &:not(:disabled)` block that sets `color: var(--neutral-01, #070a0b)`. Place it after the three base declarations and before `&:disabled`.

    Leave the `border:` and `background:` declarations, the whole `&:disabled` branch, the Cancel rule, and every other rule byte-unchanged. The disabled text passes; the disabled BORDER miss (1.66 / 1.36) belongs to the sibling todo `2026-10-11-winetricks-tab-contrast-misses-below-the-45-and-3-bars.md` and is out of scope. Do NOT touch `src/frontend/themes.scss`. The fix is a consumer-side token choice, the same decision Row and Clear made, plus a consumer-side theme override.

    Rewrite the comment above the rule (currently L73-74), keeping the UI-SPEC Color item 2 sentence and the disabled sentence. Add:
    - The `--background`-inverts-against-`--accent` reasoning: by construction, a theme with a near-white accent has a dark background. Point to `Row/index.scss` Retry and the Clear rule as the same pair.
    - That the page text token carries no relationship to the accent, and measured 1.52:1 (nord-light) and 1.01:1 (midnightMirage) in live gate 45-12 G7. At the token level it failed in all 10 themes.

    Put a comment directly above the gruvbox block saying:
    - gruvbox_dark's accent `#b57614` is a mid-tone. Its own `--background` `#1d2021` measures 4.35:1 against it, under 4.5. Only near-black clears it, and `--neutral-01` measures 5.26:1.
    - This is a theme-scoped override rather than a `themes.scss` edit, following NavTabs' `body.nord-light &` precedent: a measured per-theme collision, not a general rule.
    - `:not(:disabled)` is load-bearing. Without it the override's specificity beats `&:disabled` and paints near-black text on the transparent disabled button.
    - Retry and Clear share the 4.35:1, recorded in a follow-up todo.
    - NOT LIVE-VERIFIED: contrast arithmetic; a capture is owed at the next 45-12 re-run.

    Comment rules: write every comment as WHOLE-LINE `//` lines only, and put no trailing comment on any declaration line. `read()` strips whole-line comments only, so a trailing `// ...` would glue onto the next statement and hide it from `declsAtDepthZero`; the non-vacuity test would catch that, but avoid it. Do not quote the old declaration verbatim in a comment (name the token `--text-default` instead).

    Re-run the verify command; all 3 suites must pass. Then commit exactly these two paths: `fix(winetricks): invert enabled Apply text against its accent fill in every theme (261011-gpn)`, with a body naming the 10-theme result and the gruvbox_dark override, ending with the line `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
  </action>
  <verify>
    <automated>pnpm jest src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/tokenCensus.test.ts src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/stickyBar.test.tsx --selectProjects Frontend 2>&1 | grep -E '^(PASS|FAIL)|Test Suites:|Tests:'</automated>
    <automated>npx prettier --file-info src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss | grep -Eq '"ignored":[[:space:]]*false' && npx prettier --file-info src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts | grep -Eq '"ignored":[[:space:]]*false' && npx prettier --check src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts</automated>
    <automated>git diff --quiet HEAD -- src/frontend/themes.scss && grep -v '^[[:space:]]*//' src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss | grep -c '#ffffff' | grep -qx 0 && grep -v '^[[:space:]]*//' src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.scss | grep -Eq 'body\.gruvbox_dark &:not\(:disabled\)'</automated>
  </verify>
  <done>
    - RED was observed and its count recorded: 10 per-theme failures plus non-vacuity, before the SCSS edit.
    - GREEN: the jest line shows `Test Suites: 3 passed, 3 total` and no FAIL.
    - Both paths report `"ignored": false`, and `prettier --check` passes over exactly those two paths.
    - `themes.scss` is unchanged. No non-comment `#ffffff` remains in StickyBar. The gruvbox override carries `:not(:disabled)`.
    - One commit contains exactly the two files.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Mutation proofs: the gate sees the reported defect, the gruvbox override is load-bearing, and the override cannot reach disabled Apply</name>
  <files>src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts</files>
  <precondition>Task 1's commit exists, and `git diff --quiet HEAD -- src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts` exits 0.</precondition>
  <read_first>
    - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts: only the describe Task 1 appended (the end of the file) and L663-694 (`declsAtDepthZero`).
  </read_first>
  <behavior>
    - Test A, "the pre-fix pair fails 4.5:1 in the two themes the live gate sampled". For `body.nord-light` and `body.midnightMirage`, resolve the LITERAL old declarations through the same `themeTokens` + `globals` + `resolveValue` path the gate uses: the old `color` was `var(--text-default, #ffffff)` and the `background` is `var(--accent, #0080ff)`. Assert that each ratio is < 4.5 (expected about 1.52 and about 1.01). This proves the per-theme gate detects the exact defect the todo reports. The 1.01/1.52 capture numbers need not match exactly, because token resolution and pixel sampling differ; only the pass/fail side of 4.5 matters. Use the object form so a failure names the theme and the ratio.
    - Test B, "the gruvbox_dark override is load-bearing". Resolve the depth-0 BASE `color` (deliberately NOT the override) against the base `background` in `body.gruvbox_dark`, and assert the ratio is < 4.5 (expected about 4.35). Give the assertion a message saying that if this goes red, gruvbox's tokens changed so the base pair now passes, and the override (and this test) should be deleted, not re-pinned.
    - Test C, "a theme override cannot reach disabled Apply". Collect every nested selector inside the Apply block body that begins with `body.` and assert each one ends with `&:not(:disabled)`. The list must be non-empty, and it must contain the gruvbox one. Also assert the `&:disabled` block still declares `background: transparent` and a `color` that resolves in gruvbox_dark to the same value as `var(--text-secondary, #a8aeaf)`.
    - Test D, "checker can fail", using the tokenCensus.test.ts sabotage idiom in memory with NO file mutation. Run the Test C predicate over `applyBody.replace('&:not(:disabled)', '&')` and assert that it flags the sabotaged copy.
    - Tests A-D all pass on the Task 1 stylesheet.
  </behavior>
  <action>
    Add the four tests from `<behavior>` inside the describe Task 1 appended, after its existing tests. Reuse that describe's already-read `themesScss`, `globals` and Apply-block body.

    Factor Test C's check into a small module-level pure predicate, e.g. `themeOverridesMissingNotDisabled(applyBody): string[]`, which returns the offending selectors. Tests C and D then share one checker, and D proves C can fail. Do not mutate the SCSS file on disk for any proof. The sabotage is an in-memory string replace, which also avoids the revert-destroys-work trap recorded in project memory.

    Run the verify command; all 3 suites must pass. Then run `pnpm codecheck`: both `tsc` passes must exit 0. Commit only the test file: `test(winetricks): prove the Apply contrast gate sees the 45-12 G7 defect and the gruvbox override (261011-gpn)`, ending with the line `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Then run `graphify update .` (graphify-out is gitignored; nothing to commit).
  </action>
  <verify>
    <automated>pnpm jest src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/tokenCensus.test.ts src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/stickyBar.test.tsx --selectProjects Frontend 2>&1 | grep -E '^(PASS|FAIL)|Test Suites:|Tests:'</automated>
    <automated>npx prettier --file-info src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts | grep -Eq '"ignored":[[:space:]]*false' && npx prettier --check src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts</automated>
    <automated>pnpm codecheck</automated>
  </verify>
  <done>
    - `Test Suites: 3 passed, 3 total`; the test count is Task 1's count + 4.
    - Prettier check passes on the one path written.
    - `pnpm codecheck` exits 0.
    - One commit contains only the test file.
  </done>
</task>

<task type="auto">
  <name>Task 3: Close the Apply todo with a Fix section and file the gruvbox_dark Retry/Clear residual as a new todo</name>
  <files>.planning/todos/completed/2026-10-11-winetricks-apply-button-text-is-unreadable-in-nord-light-and-midnightmirage.md, .planning/todos/pending/2026-10-11-winetricks-retry-and-clear-paint-4-35-to-1-in-gruvbox-dark.md</files>
  <precondition>The Task 1 and Task 2 commits exist. Note Task 1's short hash and Task 2's short hash.</precondition>
  <read_first>
    - .planning/todos/completed/2026-10-10-authtrigger-origin-lookup-is-an-unguarded-bracket-access.md: the `## Fix (...)` heading form and the frontmatter treatment on close.
    - .claude/skills/gamelib-conventions/SKILL.md, section "Todo triage frontmatter": already loaded via `<context>`, so do not re-read it.
  </read_first>
  <action>
    **Close the Apply todo.**
    1. Append to `.planning/todos/pending/2026-10-11-winetricks-apply-button-text-is-unreadable-in-nord-light-and-midnightmirage.md` a section headed `## Fix (2026-10-11, quick 261011-gpn, commit `<Task 1 hash>`)`. Match the precedent's heading form, with the hash in backticks. State, in hand-wrapped prose matching the file's ~100-column wrap:
       - (a) The change: the enabled Apply `color` moved from the page text token to `--background`, the house pair Retry and Clear already use. Also add a gruvbox_dark-only `body.gruvbox_dark &:not(:disabled)` override to `--neutral-01`, and say why it is needed and why `:not(:disabled)`.
       - (b) The token-level per-theme result as a markdown table of all 10 themes: pre-fix ratio, then post-fix ratio, numbers from this plan's objective table, with gruvbox_dark post-fix at 5.26 via the override. Note that the pre-fix pair failed in all 10, not only the two sampled.
       - (c) The gate: the new describe in `src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts`, its mutation proofs, and the Task 2 hash.
       - (d) `src/frontend/themes.scss` is listed in `files:` but was deliberately NOT edited: a consumer-side choice, the same decision Row and Clear made.
       - (e) The disabled-border miss (1.66 / 1.36) stays with `2026-10-11-winetricks-tab-contrast-misses-below-the-45-and-3-bars.md`.
       - (f) NOT live-verified. The todo explicitly asks to verify by sampling a capture, not by reading the token. A pixel-sampled capture of enabled Apply in nord-light and midnightMirage, and now gruvbox_dark too, is still owed to the next 45-12 live-gate re-run. The jest pin is the desk-level proof, not a substitute.
       - (g) The residual: Retry and Clear measure 4.35:1 in gruvbox_dark, now tracked in the new todo, named by filename.
    2. In that todo's frontmatter, add `src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts` to `files:`, as the precedent did. Leave every other key exactly as written.
    3. `git mv` the file to `.planning/todos/completed/` under the same filename.

    **File the residual todo.** Create `.planning/todos/pending/2026-10-11-winetricks-retry-and-clear-paint-4-35-to-1-in-gruvbox-dark.md` with these frontmatter keys, in order:
    - `created` (the current ISO-8601 UTC timestamp)
    - `title` (Retry and Clear paint `--background` on `--accent` at 4.35:1 in gruvbox_dark, under 4.5)
    - `area: ui`
    - `severity: minor` (a near-miss of AA in one theme on two controls)
    - `platform: any`
    - `ready: code`
    - `found_by` (a quoted string naming quick 261011-gpn's token-level census, 2026-10-11)
    - `files:` listing `src/frontend/screens/Settings/sections/WinetricksSettings/Row/index.scss` and `src/frontend/screens/Settings/sections/WinetricksSettings/EverythingElseGroup/index.scss`

    Per the conventions skill, `severity`, `platform` and `ready` must be bare, lowercase, exact, and in that order. The body must state:
    - The measurement: `#1d2021` on `#b57614`, 4.35:1, token-resolved through `themeTokens.test.ts`'s resolver. It is not pixel-sampled.
    - That Retry (`.WinetricksRow__retry`) and Clear (`.WinetricksEverythingElse__clear`) share the pair. Confirm each still declares it with a scoped grep and quote the line numbers.
    - That `styles/_buttons.scss` `.button.is-text` uses the same pair without fallbacks. Run `grep -rn 'is-text' src/frontend` and record the consumer count it returns, stating zero if it is zero.
    - Two fix options, without choosing:
      - (a) Copy Apply's `body.gruvbox_dark &:not(:disabled)` override into each rule and extend the themeTokens census to cover them.
      - (b) A theme-level gruvbox token change. That would also cover `.button.is-text` and let Apply's override be deleted (Task 2's Test B goes red to say so), but `--accent` drives many gruvbox surfaces, so it is a design decision.
    - That a live capture in gruvbox_dark is owed either way.

    Run `pnpm planning-gates` (about 5s at planning; it exits 0 on a clean tree) and fix any frontmatter failure in the new todo itself. Never widen the gate.

    Commit exactly these paths: the deletion and addition from the `git mv` (both sides of the rename) plus the new pending todo. Message: `docs(quick-261011-gpn): close the Winetricks Apply contrast todo and file the gruvbox Retry/Clear residual`, ending with the line `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Do NOT stage `.planning/quick/**`, STATE.md or `.planning/milestone.lock`. The orchestrator commits those.
  </action>
  <verify>
    <automated>test -f .planning/todos/completed/2026-10-11-winetricks-apply-button-text-is-unreadable-in-nord-light-and-midnightmirage.md && test ! -e .planning/todos/pending/2026-10-11-winetricks-apply-button-text-is-unreadable-in-nord-light-and-midnightmirage.md && grep -q '^## Fix (2026-10-11, quick 261011-gpn, commit `' .planning/todos/completed/2026-10-11-winetricks-apply-button-text-is-unreadable-in-nord-light-and-midnightmirage.md && sed -n '2,10p' .planning/todos/pending/2026-10-11-winetricks-retry-and-clear-paint-4-35-to-1-in-gruvbox-dark.md | grep -E '^(severity|platform|ready):' | tr '\n' ' ' | grep -qx 'severity: minor platform: any ready: code ' && pnpm planning-gates</automated>
    Prettier: every path this task writes is under `.planning/`. `npx prettier --file-info` reports `.planning/**` as `{ "ignored": true, "inferredParser": null }` (measured at planning for `.planning/todos/completed/`). A `--check` would therefore be vacuous, so it is deliberately omitted per the gamelib-conventions formatter rule. Consistency comes from hand-matching the surrounding todo corpus.
  </verify>
  <done>
    - The Apply todo is in `completed/` with a `## Fix` section covering points (a)-(g), and its `files:` gains the test path.
    - The new pending todo has `severity: minor`, `platform: any` and `ready: code` in order, and `pnpm planning-gates` exits 0.
    - One docs commit contains only the rename and the new todo.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none | A stylesheet token choice and a source-text test. No input, IPC, network, credentials or package installs. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-gpn-01 | Repudiation | Apply contrast gate (themeTokens.test.ts) | low | mitigate | Avoid a green that proves nothing: a non-vacuity test (both declarations found, override found), an observed RED before the fix, and in-memory mutation proofs (Tests A-D). |
| T-gpn-02 | Tampering | Commit staging | low | mitigate | Stage explicit paths only. An untracked `.planning/milestone.lock` exists, and the branch ancestry is asserted before the first commit. |
| T-gpn-SC | Tampering | npm/pip/cargo installs | low | accept | No package is installed or added; the legitimacy gate does not fire. |
</threat_model>

<verification>
- Jest, paths-first form: `themeTokens.test.ts`, `tokenCensus.test.ts` and `stickyBar.test.tsx` give `Test Suites: 3 passed, 3 total`.
- No commit of this task touches `themes.scss`. Check with `git log --oneline 169b22062..HEAD -- src/frontend/themes.scss`, which must print nothing. Do not diff against `main`: the branch already carries other commits ahead of it.
- `npx prettier --check` over the two prettier-visible paths passes.
- `pnpm codecheck` exits 0.
- `pnpm planning-gates` exits 0.
- `git log --oneline 169b22062..HEAD` shows exactly 3 new commits (fix, test, docs). Each carries `261011-gpn` and ends with the Fable co-author line.
- Optional, standalone and not chained (a `&&` chain shows one red per attempt): `pnpm lint`.
</verification>

<success_criteria>
- Enabled Apply text resolves to >= 4.5:1 against its fill in all 10 themes, and the lowest is gruvbox_dark at 5.26 via the override. Disabled Apply is unchanged.
- The gate is proven able to fail on the exact reported defect and on removal of the gruvbox override's disabled guard.
- `themes.scss` is untouched, and no sibling-todo item is touched.
- The todo is closed, and it states plainly that the pixel-sampled capture is still owed. The gruvbox Retry/Clear residual is recorded and passes the CI frontmatter gate.
</success_criteria>

<output>
Create `.planning/quick/261011-gpn-fix-the-winetricks-apply-enabled-button-/261011-gpn-SUMMARY.md` when done. The orchestrator commits it, so do not commit it yourself. The SUMMARY records:
- The observed RED count from Task 1.
- The per-theme GREEN ratios if printed. Otherwise the planning table stands.
- The three commit hashes.
- `git branch --show-current`.
- The `.button.is-text` consumer count from Task 3.
- An `## Open observations` entry stating that the live pixel capture in nord-light, midnightMirage and gruvbox_dark is owed to the next 45-12 re-run.
</output>
