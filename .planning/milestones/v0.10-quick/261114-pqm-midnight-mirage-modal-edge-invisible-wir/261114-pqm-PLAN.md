---
phase: quick-261114-pqm
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/themes.scss
  - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
  - src/frontend/components/UI/Dialog/components/Dialog.tsx
  - src/frontend/components/UI/Dialog/__tests__/dialogWindowChrome.test.ts
autonomous: true
requirements: [QUICK-261114-pqm]

must_haves:
  truths:
    - "In Midnight Mirage, an open modal's paper is visibly lighter than the page and backdrop behind it, and has a visible 1px edge"
    - "Every Dialog consumer's paper draws a 1px border from --modal-border, in every theme"
    - "No theme gets a new jarring edge: themes whose --modal-border equals their modal surface stay visually unchanged; high-contrast's white edge is intentional"
    - "The themeTokens and dialogWindowChrome suites stay green, with new assertions that fail if the wiring or the Midnight Mirage token fix is reverted"
  artifacts:
    - path: "src/frontend/components/UI/Dialog/components/Dialog.tsx"
      provides: "StyledPaper border consuming --modal-border"
      contains: "var(--modal-border"
    - path: "src/frontend/themes.scss"
      provides: "Midnight Mirage modal surface and border tokens"
      contains: "--modal-border: rgba(255, 255, 255, 0.1)"
  key_links:
    - from: "src/frontend/components/UI/Dialog/components/Dialog.tsx"
      to: "src/frontend/themes.scss --modal-border"
      via: "StyledPaper border declaration"
      pattern: "border:\\s*'1px solid var\\(--modal-border"
---

<objective>
Make modal dialogs have a visible edge in the Midnight Mirage theme.

Root cause (diagnosed with the user, agreed fix):
1. `--modal-border` is declared in all 10 theme blocks of `src/frontend/themes.scss` but consumed nowhere in `src/frontend` — the Dialog primitive's `StyledPaper` sets only `backgroundColor`, `maxWidth`, `borderRadius`.
2. `body.midnightMirage` sets `--modal-background: var(--background-darker)` (= `--neutral-01` #070a0b), identical to its `--body-background`, under an 80%-black backdrop — so the paper is indistinguishable from what surrounds it. Its `--modal-border: var(--background)` (#161c1e) would be near-invisible even once wired.

Output: Midnight Mirage tokens fixed, `--modal-border` wired into `StyledPaper`, regression assertions in the two existing source-reading test suites.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@src/frontend/components/UI/Dialog/components/Dialog.tsx
@src/frontend/components/UI/Dialog/__tests__/dialogWindowChrome.test.ts

Theme audit (done at planning time; resolved values, all 10 `themeSelectors`):

| Theme | --modal-background | --modal-border | Once border is wired | Action |
|---|---|---|---|---|
| midnightMirage | #070a0b (= body) | #161c1e | invisible; surface = body under 80% black | FIX (Task 1) |
| cyberSpaceOasis | #13172a | #1f253f | subtle, tinted edge | none — designed value, now honoured |
| gruvbox_dark | #282828 (= body) | = surface | invisible (border == paper) | none — no regression |
| high-contrast | #121212 | #ffffffff | solid white 1px edge | none — high-contrast theme; a hard white edge is the theme's intent |
| dracula | #282a35 (= body) | = surface | invisible | none |
| nord-light | body (light) | = surface | invisible | none |
| nord-dark | #191c22 (= body) | = surface | invisible | none |
| marine | #031b22 (= body) | = surface | invisible | none |
| zombie | #1d1f1f (= body) | = surface | invisible | none |
| sweet | #110111 (= body) | = surface | invisible | none |

Why only Midnight Mirage needs the surface change: in the other "modal = body" themes the body is mid-dark (e.g. #282828), and the backdrop darkens the page behind the dialog to near-black, so the un-dimmed paper still separates. Midnight Mirage's body is already #070a0b, so the 80%-black backdrop produces ~the same colour as the paper. Applying a translucent-white border to the other equal-surface themes is NOT clearly warranted — record it as deferred in the SUMMARY (do not implement).

Palette (`src/frontend/styles/_colors.scss`): --neutral-01 #070a0b, --neutral-02 #161c1e, --neutral-03 #272f31, --neutral-04 #51595a.

<interfaces>
From src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts (module-scope helpers; reuse, do not duplicate):
- `read(relPath)` — readFileSync + stripSourceComments
- `THEMES_SCSS` = 'src/frontend/themes.scss'; `themeSelectors` — the 10 `body.<theme>` selectors
- `globalTokens(): Map<string,string>` (line ~454, reads _colors.scss)
- `themeTokens(themesScss, selector): Map<string,string>` (line 496) — base `body` block merged with theme block(s); last declaration wins
- `resolveValue(value, scope, globals): string | null` (line 507) — follows var() chains + fallbacks; returns non-var literals verbatim (so an `rgba(...)` value comes back as the raw string)
- `contrastRatio(fg, bg)` (line 562) — via `toRgb`, which only parses hex/named colours; it THROWS on `rgba(...)`. Never pass the new `--modal-border` value into it.

Existing assertions that read Midnight Mirage's `--modal-background` (must stay green after the token change):
- line ~644 `--border-color is visible in every theme` — >= 3:1 vs body and modal surfaces (midnight --border-color resolves to base `gray` #808080; vs #161c1e is ~4.3:1, passes)
- line ~1713 rest-surface census, ~1974 and ~2412 row-surface checks. Line ~1969 "the pre-fix pair fails where the live gate measured it" asserts OLD `#cc3333` FAILS on midnight's modal surface — a lighter surface lowers that contrast further, so it should still fail as expected.

From Dialog.tsx (line ~57): `const StyledPaper = styled(Paper)(() => ({ backgroundColor: 'var(--modal-background)', maxWidth: '100%', borderRadius: '10px', ...nested :has() rules }))`. dialogWindowChrome.test.ts extracts the block with `source.split('const StyledPaper')[1]?.split(')))')[0]` on comment-stripped source.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Fix Midnight Mirage modal tokens, with themeTokens assertions</name>
  <files>src/frontend/themes.scss, src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts</files>
  <behavior>
    - midnightMirage: resolved `--modal-background` differs from resolved `--body-background` (currently both #070a0b → RED before the token edit)
    - midnightMirage: resolved `--modal-background` is `#161c1e`
    - midnightMirage: resolved `--modal-border` is exactly `rgba(255, 255, 255, 0.1)` (string compare after whitespace normalisation; do NOT route through contrastRatio/toRgb — they throw on rgba)
    - every theme in `themeSelectors` resolves `--modal-border` to a non-null value (guards the fact that the Dialog paper now paints it in all 10 themes)
  </behavior>
  <action>
    RED first: add a new `describe('quick-261114-pqm: modal paper edge tokens', ...)` block near the existing `--border-color is visible in every theme` describe in themeTokens.test.ts, reusing the module-scope helpers listed in the interfaces block (read, THEMES_SCSS, themeSelectors, globalTokens, themeTokens, resolveValue). Implement the four behaviours above; use the file's object-form `expect({...}).toEqual({...})` style so a failure names the theme and values, and include a short doc comment explaining the bug (paper == body == #070a0b under an 80%-black backdrop; --modal-border was unconsumed). Run it and confirm the midnight assertions fail.

    GREEN: in `body.midnightMirage` in themes.scss change `--modal-background: var(--background-darker);` to `--modal-background: var(--background);` (resolves to --neutral-02 #161c1e; keeps the theme's own token chain rather than a raw palette reference) and `--modal-border: var(--background);` to `--modal-border: rgba(255, 255, 255, 0.1);`. Add a one/two-line `/* quick-261114-pqm: ... */` comment above them stating why (surface was identical to body and backdrop; border is now consumed by the Dialog paper). Leave the duplicate `--modal-backdrop` declarations (L132 and L147) untouched — the later one (--eighty-percent-black) wins, and it is out of scope. Change NO other theme block — per the audit table in context, the other nine render sensibly once the border is wired.

    Then run the WHOLE themeTokens suite. If any pre-existing assertion that reads midnight's `--modal-background` goes red, stop and report it in the SUMMARY with the measured ratio rather than editing a historical/regression assertion to pass — those pin live-gate measurements.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts && npx prettier --check src/frontend/themes.scss src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts</automated>
  </verify>
  <done>New describe block was observed RED before the scss edit and is GREEN after; full themeTokens suite passes; midnightMirage modal surface resolves to #161c1e and border to rgba(255, 255, 255, 0.1); no other theme block changed (`git diff src/frontend/themes.scss` touches only the midnightMirage block); prettier --check clean on both paths.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Wire --modal-border into the Dialog paper, with a source-gate test</name>
  <files>src/frontend/components/UI/Dialog/components/Dialog.tsx, src/frontend/components/UI/Dialog/__tests__/dialogWindowChrome.test.ts</files>
  <behavior>
    - The StyledPaper block (extracted the same way the existing 10px-radius test does) contains `border: '1px solid var(--modal-border, transparent)'` — RED before the Dialog.tsx edit
    - The existing StyledPaper assertions (10px radius, backgroundColor) still pass
  </behavior>
  <action>
    RED first: in dialogWindowChrome.test.ts add an `it('SOURCE GATE (PRESENCE) -- quick-261114-pqm: StyledPaper draws a 1px edge from --modal-border ...')` inside the first describe, right after the 10px-radius test, extracting `styledPaperBlock` with the identical `split('const StyledPaper')[1]?.split(')))')[0]` approach and asserting a regex like `/border:\s*'1px solid var\(--modal-border, transparent\)'/`. Include a "Breaks if:" comment in the file's existing style (the token was declared in all 10 themes but consumed nowhere, so Midnight Mirage dialogs had no edge). Run and confirm RED.

    GREEN: in Dialog.tsx add `border: '1px solid var(--modal-border, transparent)'` to the StyledPaper object directly after `backgroundColor`. The `transparent` fallback keeps the paper edgeless (no MUI-default currentColor border) if a future theme omits the token. Extend the comment block above StyledPaper with a `quick-261114-pqm:` paragraph matching the file's quick-id-prefixed rationale style: --modal-border was declared in every theme but consumed nowhere; the paper now draws it, which is what gives Midnight Mirage dialogs a visible edge (its surface token was fixed alongside in themes.scss). Do not touch the nested `:has()` rules or any other part of the component. The fallback contains no `)))` sequence, so the test's block extraction stays valid — confirm the existing radius test still passes.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/frontend/components/UI/Dialog/__tests__ && npx tsc --noEmit -p . && npx prettier --check src/frontend/components/UI/Dialog/components/Dialog.tsx src/frontend/components/UI/Dialog/__tests__/dialogWindowChrome.test.ts</automated>
  </verify>
  <done>New source-gate test was observed RED then GREEN; all Dialog __tests__ pass; tsc clean; prettier --check clean on both paths; `grep -rn "modal-border" src/frontend --include='*.tsx'` now returns the Dialog.tsx consumer.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none | CSS token values and a styled-component declaration; no input, IPC, network or persistence crosses a boundary |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-261114-pqm-01 | Tampering | themes.scss / Dialog.tsx | accept | Static, compile-time styling only; no user-controlled values reach these declarations |
</threat_model>

<verification>
- `npx jest src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts src/frontend/components/UI/Dialog/__tests__` all green
- `npx prettier --check` over the four modified paths (all four report `"ignored": false` under `prettier --file-info`, checked at planning time) is clean
- `git diff --stat` for this task's commit lists exactly the four files in `files_modified`
- Live check is the operator's: `pnpm tauri:dev` (not `tauri:dev:run`), Midnight Mirage theme, open any dialog (e.g. Settings) — paper is lighter than the dimmed page and has a faint 1px edge; spot-check high-contrast (white edge expected) and one equal-surface theme such as dracula (no visible change expected)
</verification>

<success_criteria>
- Midnight Mirage dialogs have a distinguishable surface (#161c1e) and a visible translucent-white 1px edge
- `--modal-border` has exactly one consumer: the shared Dialog paper, inherited by every Dialog consumer
- Other nine themes untouched; audit table outcome recorded in SUMMARY, with "translucent border for the other equal-surface dark themes" listed as deferred (not warranted at this time)
</success_criteria>

<commit_rules>
The working tree has unrelated uncommitted changes under src/frontend/screens/Game/ and .planning/. Stage ONLY this plan's files by explicit path (`git add src/frontend/themes.scss src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts src/frontend/components/UI/Dialog/components/Dialog.tsx src/frontend/components/UI/Dialog/__tests__/dialogWindowChrome.test.ts`, plus this quick dir's SUMMARY when docs are committed). Never `git add -A` / `git add .`, and never `gsd-sdk query commit` (it sweeps every dirty .planning file). After committing code, run `graphify update .`.
</commit_rules>

<output>
Create `.planning/quick/261114-pqm-midnight-mirage-modal-edge-invisible-wir/261114-pqm-SUMMARY.md` when done
</output>
